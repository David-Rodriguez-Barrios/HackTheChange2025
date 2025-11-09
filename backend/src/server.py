import os
import sys
from pathlib import Path
from typing import Optional, Dict, Any, List, Set
from enum import Enum
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from uuid import uuid4
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import httpx
from dotenv import load_dotenv
import asyncio
from collections import deque
import cv2
import numpy as np
from io import BytesIO
from .db_queries import get_stream_by_id, create_stream
from .neon_db import init_db_pool, close_db_pool

# Add yolo directory to path for importing bedrock_detector
backend_dir = Path(__file__).parent.parent
yolo_dir = backend_dir / "yolo"
if str(yolo_dir) not in sys.path:
    sys.path.insert(0, str(yolo_dir))

try:
    from bedrock_detector import HaikuIncidentDetector
    DETECTOR_AVAILABLE = True
except ImportError:
    DETECTOR_AVAILABLE = False
    HaikuIncidentDetector = None

load_dotenv()


class AlertLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class AlertCreateRequest(BaseModel):
    alertName: str
    level: AlertLevel
    location: Optional[str] = None
    reason: Optional[str] = None
    streamId: Optional[str] = None
    source: Optional[str] = "LLM"
    time: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None


class AlertResponse(AlertCreateRequest):
    id: str
    time: datetime

# In-memory storage for webcam stream
webcam_stream_buffer: deque = deque(maxlen=10)  # Store last 10 frames
webcam_stream_active = False
webcam_stream_lock = asyncio.Lock()

# In-memory storage for alerts
alerts_store: deque[AlertResponse] = deque(maxlen=200)
alerts_lock = asyncio.Lock()
alert_clients: Set[WebSocket] = set()

# Bedrock detector instance (lazy initialization)
detector_instance: Optional[Any] = None
detector_lock = asyncio.Lock()
detector_processing_task: Optional[asyncio.Task] = None


def serialize_alert(alert: AlertResponse) -> Dict[str, Any]:
    """Convert alert to JSON-serializable dict."""
    return alert.model_dump(mode="json")


async def register_alert_client(websocket: WebSocket):
    """Register a WebSocket client for alert broadcasts."""
    alert_clients.add(websocket)


async def broadcast_alert(alert: AlertResponse):
    """Send alert to all connected WebSocket clients."""
    if not alert_clients:
        return
    
    message = {"type": "alert", "alert": serialize_alert(alert)}
    disconnected: List[WebSocket] = []
    
    for client in list(alert_clients):
        try:
            await client.send_json(message)
        except Exception:
            disconnected.append(client)
    
    for client in disconnected:
        await unregister_alert_client(client)


async def add_alert(alert: AlertResponse):
    """Store alert and broadcast to listeners."""
    async with alerts_lock:
        alerts_store.appendleft(alert)
    await broadcast_alert(alert)


async def unregister_alert_client(websocket: WebSocket):
    """Remove WebSocket client from registry."""
    alert_clients.discard(websocket)


async def get_alert_history(limit: Optional[int] = None) -> List[Dict[str, Any]]:
    """Return serialized alert history."""
    async with alerts_lock:
        alerts_list = list(alerts_store)
    
    if limit is not None:
        alerts_list = alerts_list[:limit]
    
    return [serialize_alert(alert) for alert in alerts_list]


async def get_or_create_detector():
    """Lazy initialization of the Bedrock detector."""
    global detector_instance
    
    if not DETECTOR_AVAILABLE:
        return None
    
    async with detector_lock:
        if detector_instance is None:
            try:
                # Ensure backend URL is set for alert forwarding
                if not os.getenv('BACKEND_ALERT_URL') and not os.getenv('BACKEND_URL'):
                    # Default to localhost if running locally
                    port = os.getenv('PORT', '3000')
                    os.environ['BACKEND_URL'] = f'http://localhost:{port}'
                
                detector_instance = HaikuIncidentDetector()
            except Exception:
                detector_instance = None
        return detector_instance


async def process_webcam_frames():
    """Background task to process webcam frames with Bedrock detector."""
    global detector_processing_task
    
    detector = await get_or_create_detector()
    if not detector:
        return
    
    last_processed_time = 0.0
    frame_count = 0
    
    while webcam_stream_active:
        try:
            # Get latest frame from buffer
            frame_data = None
            async with webcam_stream_lock:
                if len(webcam_stream_buffer) > 0:
                    frame_data = webcam_stream_buffer[-1]
            
            if frame_data:
                # Convert JPEG bytes to OpenCV frame
                try:
                    nparr = np.frombuffer(frame_data, np.uint8)
                    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                    
                    if frame is not None:
                        frame_count += 1
                        current_time = frame_count / 30.0  # Assume ~30 FPS
                        
                        # Process frame if enough time has passed (respect analyze_interval)
                        time_since_last = current_time - last_processed_time
                        if time_since_last >= detector.analyze_interval:
                            # Start analysis in background thread
                            if detector.start_analysis(frame, current_time):
                                last_processed_time = current_time
                except Exception:
                    pass
            
            # Sleep to avoid busy waiting
            await asyncio.sleep(0.1)
            
        except Exception:
            await asyncio.sleep(1.0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db_pool()
    yield
    # Shutdown
    await close_db_pool()
    # Cancel detector processing task if running
    global detector_processing_task
    if detector_processing_task and not detector_processing_task.done():
        detector_processing_task.cancel()
        try:
            await detector_processing_task
        except asyncio.CancelledError:
            pass


app = FastAPI(lifespan=lifespan)

# CORS configuration
if os.getenv("NODE_ENV") != "production":
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[frontend_url],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


class StreamCreateRequest(BaseModel):
    url: str


@app.get("/api/alerts")
async def list_alerts(limit: Optional[int] = Query(default=None, ge=1, le=200)):
    """Return recent alerts (most recent first)."""
    try:
        limit_value = limit if isinstance(limit, int) else None
        alerts = await get_alert_history(limit_value)
        return {"alerts": alerts}
    except Exception:
        raise HTTPException(status_code=500, detail="Error retrieving alerts")


@app.post("/api/alerts", response_model=AlertResponse)
async def create_alert_endpoint(alert_request: AlertCreateRequest):
    """Create a new alert (typically from the LLM detector)."""
    try:
        alert_time = alert_request.time or datetime.now(timezone.utc)
        alert_data = alert_request.model_dump()
        alert_data["time"] = alert_time
        alert = AlertResponse(id=str(uuid4()), **alert_data)
        await add_alert(alert)
        return alert
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error creating alert")


@app.post("/api/streams")
async def create_stream_endpoint(request: StreamCreateRequest):
    """Create a new stream"""
    try:
        if not request.url or not isinstance(request.url, str):
            raise HTTPException(status_code=400, detail="URL is required.")
        
        stream_config = await create_stream(request.url)
        
        return {
            "id": stream_config["id"],
            "url": stream_config["url"],
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error creating stream")


@app.get("/api/streams/{stream_id}")
async def get_stream_endpoint(stream_id: str):
    """Get a stream by ID"""
    try:
        stream = await get_stream_by_id(stream_id)
        
        if not stream:
            raise HTTPException(status_code=404, detail="Stream ID Not found")
        
        return {
            "id": stream["id"],
            "url": stream["url"],
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error retrieving stream")


@app.websocket("/api/websocket/webcam")
async def websocket_webcam(websocket: WebSocket):
    try:
        await websocket.accept()
    except Exception:
        return
    
    global webcam_stream_active, webcam_stream_buffer, detector_processing_task
    
    try:
        async with webcam_stream_lock:
            webcam_stream_active = True
            webcam_stream_buffer.clear()
        
        # Start detector processing task if not already running
        if detector_processing_task is None or detector_processing_task.done():
            detector_processing_task = asyncio.create_task(process_webcam_frames())
        
        while True:
            data = await websocket.receive_bytes()
            
            async with webcam_stream_lock:
                webcam_stream_buffer.append(data)
                
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        async with webcam_stream_lock:
            webcam_stream_active = False


@app.websocket("/api/websocket/alerts")
async def websocket_alerts(websocket: WebSocket):
    try:
        await websocket.accept()
        await register_alert_client(websocket)
        
        # Send alert history on connect
        history = await get_alert_history()
        if history:
            await websocket.send_json({"type": "history", "alerts": history})
        
        while True:
            # Keep connection alive; we don't expect messages from clients
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await unregister_alert_client(websocket)


@app.get("/api/stream")
async def stream_proxy_endpoint(streamId: Optional[str] = Query(None)):
    if not streamId:
        raise HTTPException(status_code=400, detail="Stream ID is required")
    
    stream_id = streamId 
    

    if stream_id == "webcam":
        async def generate_webcam():
            global webcam_stream_active, webcam_stream_buffer
            last_frame = None
            
            while True:
                current_frame = None
                async with webcam_stream_lock:
                    if len(webcam_stream_buffer) > 0:
                        # Get the latest frame
                        current_frame = webcam_stream_buffer[-1]
                
                # Only send if we have a new frame
                if current_frame and current_frame != last_frame:
                    yield b'--frame\r\n'
                    yield b'Content-Type: image/jpeg\r\n\r\n'
                    yield current_frame
                    yield b'\r\n'
                    last_frame = current_frame
                elif not webcam_stream_active:
                    # No active stream, wait a bit
                    await asyncio.sleep(0.1)
                    continue
                
                await asyncio.sleep(0.033)  # ~30 FPS
        
        return StreamingResponse(
            generate_webcam(),
            media_type="multipart/x-mixed-replace; boundary=frame",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            }
        )
    
    # Try to get stream from database
    stream = await get_stream_by_id(stream_id)
    
    if not stream:
        # Check if it's a string ID that couldn't be converted to int
        try:
            int(stream_id)
            # It's a valid int but stream not found
            raise HTTPException(status_code=404, detail=f"Stream with ID '{stream_id}' not found")
        except ValueError:
            # It's a string ID that's not numeric and not "webcam"
            raise HTTPException(
                status_code=404, 
                detail=f"Stream ID '{stream_id}' not found. Stream IDs must be numeric or 'webcam'"
            )
    
    external_url = stream["url"]
    
    # Stream the external content
    async def generate():
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                async with client.stream("GET", external_url) as response:
                    if response.status_code < 200 or response.status_code >= 300:
                        return
                    
                    # Stream chunks
                    async for chunk in response.aiter_bytes():
                        yield chunk
            except Exception:
                return
    
    # Get content type by making a HEAD request first
    content_type = "video/mp4"
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            head_response = await client.head(external_url)
            content_type = head_response.headers.get("content-type", "video/mp4")
        except:
            # If HEAD fails, try GET and get content type from response
            try:
                async with httpx.AsyncClient(timeout=10.0) as client2:
                    get_response = await client2.get(external_url, follow_redirects=True)
                    content_type = get_response.headers.get("content-type", "video/mp4")
            except:
                pass
    
    return StreamingResponse(
        generate(),
        media_type=content_type,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        }
    )


@app.options("/api/stream")
async def stream_options():
    """Handle CORS preflight for stream endpoint"""
    from fastapi.responses import Response
    return Response(
        status_code=200,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        }
    )


# Serve static files from frontend dist
frontend_path = Path(__file__).parent.parent.parent / "HTC-dashboard" / "dist"
if frontend_path.exists():
    # Mount static assets
    assets_path = frontend_path / "assets"
    if assets_path.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_path)), name="assets")
    
    # Serve index.html for all non-API routes
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve frontend index.html for all non-API routes"""
        # Don't serve frontend for API routes
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        
        # Check if it's a static asset request
        if full_path.startswith("assets/"):
            raise HTTPException(status_code=404, detail="Not found")
        
        # Serve index.html for SPA routing
        index_file = frontend_path / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
        raise HTTPException(status_code=404, detail="Not found")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3000))
    uvicorn.run(app, host="0.0.0.0", port=port)


import os
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import httpx
from dotenv import load_dotenv
import asyncio
from collections import deque
from .db_queries import get_stream_by_id, create_stream
from .neon_db import init_db_pool, close_db_pool

load_dotenv()

# In-memory storage for webcam stream
webcam_stream_buffer: deque = deque(maxlen=10)  # Store last 10 frames
webcam_stream_active = False
webcam_stream_lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db_pool()
    yield
    # Shutdown
    await close_db_pool()


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
    except Exception as error:
        print(f"Error creating stream: {error}")
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
    except Exception as error:
        print(f"Error getting stream: {error}")
        raise HTTPException(status_code=500, detail="Error retrieving stream")


@app.websocket("/api/websocket/webcam")
async def websocket_webcam(websocket: WebSocket):
    try:
        await websocket.accept()
        print(f"Webcam WebSocket connected from {websocket.client}")
    except Exception as e:
        print(f"Error accepting WebSocket: {e}")
        return
    
    global webcam_stream_active, webcam_stream_buffer
    
    try:
        async with webcam_stream_lock:
            webcam_stream_active = True
            webcam_stream_buffer.clear()
        
        print("Webcam stream active")
        
        while True:
            data = await websocket.receive_bytes()
            
            async with webcam_stream_lock:
                webcam_stream_buffer.append(data)
                
    except WebSocketDisconnect:
        print("Webcam stream disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        async with webcam_stream_lock:
            webcam_stream_active = False


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
    
    stream = await get_stream_by_id(stream_id)
    
    if not stream:
        raise HTTPException(status_code=404, detail="Stream ID Not found")
    
    external_url = stream["url"]
    
    # Stream the external content
    async def generate():
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                async with client.stream("GET", external_url) as response:
                    if response.status_code < 200 or response.status_code >= 300:
                        print(f"Failed to fetch stream: {response.status_code}")
                        return
                    
                    # Stream chunks
                    async for chunk in response.aiter_bytes():
                        yield chunk
            except httpx.HTTPError as e:
                print(f"Stream error: {e}")
            except Exception as e:
                print(f"Unexpected stream error: {e}")
    
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


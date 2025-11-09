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
from .db_queries import (
    get_stream_by_id,
    create_stream,
    get_all_streams,
    stream_exists_by_url,
    reset_stream_store,
)

load_dotenv()

# In-memory storage for webcam stream
webcam_stream_buffer: deque = deque(maxlen=10)  # Store last 10 frames
webcam_stream_active = False
webcam_stream_lock = asyncio.Lock()


async def scan_videos_folder():
    """Scan the videos folder and automatically create streams for video files"""
    videos_dir = Path(__file__).parent.parent / "videos"
    if not videos_dir.exists():
        videos_dir.mkdir(parents=True, exist_ok=True)
        return
    
    # Supported video extensions
    video_extensions = {'.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'}
    
    created_count = 0
    for file_path in videos_dir.iterdir():
        if file_path.is_file() and file_path.suffix.lower() in video_extensions:
            # Create URL path for the video file
            video_url = f"/videos/{file_path.name}"
            
            # Check if stream already exists
            try:
                exists = await stream_exists_by_url(video_url)
                if not exists:
                    await create_stream(video_url)
                    created_count += 1
            except Exception as e:
                print(f"Error processing {file_path.name}: {e}")
                import traceback
                traceback.print_exc()
    
    if created_count > 0:
        print(f"Created {created_count} new stream(s) from videos folder")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await reset_stream_store()
    await scan_videos_folder()
    yield
    # Shutdown
    await reset_stream_store()


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


@app.get("/api/streams")
async def list_streams_endpoint():
    """Get all streams"""
    try:
        streams = await get_all_streams()
        return {"streams": streams}
    except Exception:
        raise HTTPException(status_code=500, detail="Error retrieving streams")


@app.post("/api/streams/scan")
async def scan_videos_endpoint():
    """Manually trigger a scan of the videos folder to add new video files as streams"""
    try:
        await scan_videos_folder()
        streams = await get_all_streams()
        return {"message": "Videos folder scanned", "streams": streams, "count": len(streams)}
    except Exception as e:
        print(f"Error scanning videos folder: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error scanning videos folder: {str(e)}")


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
    
    stream_url = stream["url"]
    
    # Check if it's a local video file (starts with /videos/)
    if stream_url.startswith("/videos/"):
        video_path = Path(__file__).parent.parent / "videos" / stream_url.replace("/videos/", "")
        if video_path.exists():
            return FileResponse(
                str(video_path),
                media_type="video/mp4",
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                }
            )
        else:
            raise HTTPException(status_code=404, detail="Video file not found")
    
    # External URL - stream the external content
    external_url = stream_url
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


# Mount videos folder to serve video files
videos_dir = Path(__file__).parent.parent / "videos"
if videos_dir.exists():
    app.mount("/videos", StaticFiles(directory=str(videos_dir)), name="videos")

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


from typing import Optional, Dict, List
import asyncio

_streams: Dict[int, Dict[str, str]] = {}
_next_stream_id: int = 1
_streams_lock = asyncio.Lock()


async def reset_stream_store() -> None:
    """Clear the in-memory stream store (useful for tests/startup)."""
    global _next_stream_id
    async with _streams_lock:
        _streams.clear()
        _next_stream_id = 1


async def get_all_streams() -> List[Dict[str, str]]:
    """Get all streams stored in memory."""
    async with _streams_lock:
        return [
            {"id": str(stream_id), "url": data["url"]}
            for stream_id, data in sorted(_streams.items())
        ]


async def get_stream_by_id(stream_id: str) -> Optional[Dict[str, str]]:
    """Get a stream by ID from the in-memory store."""
    try:
        stream_id_int = int(stream_id)
    except (TypeError, ValueError):
        return None

    async with _streams_lock:
        data = _streams.get(stream_id_int)
        if data is None:
            return None
        return {"id": str(stream_id_int), "url": data["url"]}


async def create_stream(url: str) -> Dict[str, str]:
    """Create a new stream in memory."""
    global _next_stream_id

    async with _streams_lock:
        stream_id = _next_stream_id
        _next_stream_id += 1
        _streams[stream_id] = {"url": url}
        return {"id": str(stream_id), "url": url}


async def stream_exists_by_url(url: str) -> bool:
    """Check if a stream with the given URL already exists in memory."""
    async with _streams_lock:
        return any(stream["url"] == url for stream in _streams.values())


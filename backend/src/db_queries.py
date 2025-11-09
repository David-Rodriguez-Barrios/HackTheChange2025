from typing import Optional, Dict
from sqlmodel import select
from .neon_db import get_session
from .models import Stream


async def get_stream_by_id(stream_id: str) -> Optional[Dict[str, str]]:
    """Get a stream by ID"""
    try:
        stream_id_int = int(stream_id)
    except ValueError:
        return None
    
    async with get_session() as session:
        statement = select(Stream).where(Stream.id == stream_id_int)
        result = await session.execute(statement)
        stream = result.scalar_one_or_none()
        
        if not stream:
            return None
        
        return {
            "id": str(stream.id),
            "url": stream.url,
        }


async def create_stream(url: str) -> Dict[str, str]:
    """Create a new stream"""
    async with get_session() as session:
        stream = Stream(url=url)
        session.add(stream)
        await session.commit()
        await session.refresh(stream)
        
        return {
            "id": str(stream.id),
            "url": stream.url,
        }


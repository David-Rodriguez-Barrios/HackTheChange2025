from sqlmodel import SQLModel, Field
from typing import Optional


class Stream(SQLModel, table=True):
    """Stream model representing a video stream"""
    __tablename__ = "streams"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    url: str


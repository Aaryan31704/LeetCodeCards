"""Pydantic schemas for API request/response."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class PlacardBase(BaseModel):
    problem_name: str
    github_file_path: str
    difficulty: Optional[str] = "Medium"
    pattern: Optional[str] = None
    description: Optional[str] = None
    example: Optional[str] = None
    summary: Optional[str] = None
    approach: Optional[str] = None
    time_complexity: Optional[str] = None
    space_complexity: Optional[str] = None
    code: Optional[str] = None
    mastered: Optional[bool] = False


class PlacardResponse(PlacardBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class PlacardListItem(BaseModel):
    """Minimal fields for list view."""
    id: UUID
    problem_name: str
    difficulty: Optional[str] = "Medium"
    pattern: Optional[str] = None
    mastered: Optional[bool] = False
    created_at: datetime

    class Config:
        from_attributes = True

"""Pydantic schemas for API request/response."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class PlacardBase(BaseModel):
    problem_name: str
    github_file_path: str
    difficulty: Optional[str] = "Medium"
    # The problem: official wording first, paraphrase only as a fallback.
    statement: Optional[str] = None
    description: Optional[str] = None
    example: Optional[str] = None
    plain_explanation: Optional[str] = None
    dry_run: Optional[str] = None
    # Optional depth, shown on request rather than by default.
    naive_approach: Optional[str] = None
    invariant: Optional[str] = None
    pseudocode: Optional[str] = None
    # The solution: the submitted attempt measured against the recommended one.
    pattern: Optional[str] = None
    core_insight: Optional[str] = None
    approach: Optional[str] = None
    better_approach: Optional[str] = None
    user_approach: Optional[str] = None
    optimization_verdict: Optional[str] = None
    user_time_complexity: Optional[str] = None
    user_space_complexity: Optional[str] = None
    better_time_complexity: Optional[str] = None
    better_space_complexity: Optional[str] = None
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

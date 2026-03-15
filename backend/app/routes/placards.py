"""Placards API routes (require auth)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.deps import get_current_user
from app.schemas import PlacardListItem, PlacardResponse
from app.placard_service import list_placards, list_placards_full, get_placard_by_id, toggle_mastered

router = APIRouter(prefix="/placards", tags=["placards"])


@router.get("")
async def get_placards(
    full: bool = Query(False, description="Return full placard data for flashcard deck"),
    current_user: dict = Depends(get_current_user),
):
    """Return current user's placards."""
    user_id = current_user["id"]
    if full:
        rows = await list_placards_full(user_id)
        return [PlacardResponse(**r) for r in rows]
    rows = await list_placards(user_id)
    return [PlacardListItem(**r) for r in rows]


@router.get("/{placard_id}", response_model=PlacardResponse)
async def get_placard(
    placard_id: UUID,
    current_user: dict = Depends(get_current_user),
):
    """Return full placard including code (only if owned by user)."""
    row = await get_placard_by_id(placard_id, current_user["id"])
    if not row:
        raise HTTPException(status_code=404, detail="Placard not found")
    return PlacardResponse(**row)


@router.post("/{placard_id}/mastered")
async def toggle_mastered_endpoint(
    placard_id: UUID,
    current_user: dict = Depends(get_current_user),
):
    """Toggle mastered state for a placard."""
    result = await toggle_mastered(placard_id, current_user["id"])
    if result is None:
        raise HTTPException(status_code=404, detail="Placard not found")
    return {"mastered": result}

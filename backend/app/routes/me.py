"""Current user, repo connection, sync, and resync endpoints."""

import asyncio

from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_current_user
from app.user_service import set_user_repo, get_user_by_id
from app.github_service import create_webhook_for_repo
from app.placard_service import process_new_commits_for_user

router = APIRouter(prefix="/me", tags=["me"])


@router.get("")
async def me(current_user: dict = Depends(get_current_user)):
    return {
        "id": str(current_user["id"]),
        "username": current_user["username"],
        "repo_owner": current_user.get("repo_owner"),
        "repo_name": current_user.get("repo_name"),
        "leetcode_path_prefix": current_user.get("leetcode_path_prefix") or "LeetCode",
    }


@router.post("/repo")
async def connect_repo(
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    """Connect a GitHub repo. Creates webhook and kicks off initial sync in background."""
    repo_owner = (body.get("repo_owner") or "").strip()
    repo_name = (body.get("repo_name") or "").strip()
    leetcode_path_prefix = (body.get("leetcode_path_prefix") or "LeetCode").strip()
    if not repo_owner or not repo_name:
        raise HTTPException(status_code=400, detail="repo_owner and repo_name required")

    user_id = current_user["id"]
    from app.user_service import get_user_by_github_id
    full_user = await get_user_by_github_id(current_user["github_id"])
    if not full_user or not full_user.get("access_token"):
        raise HTTPException(status_code=400, detail="User token missing; try logging in again")

    webhook_ok = await create_webhook_for_repo(
        repo_owner=repo_owner,
        repo_name=repo_name,
        access_token=full_user["access_token"],
    )

    await set_user_repo(user_id, repo_owner, repo_name, leetcode_path_prefix)

    from app.placard_service import full_resync_background
    asyncio.create_task(full_resync_background(user_id))

    return {
        "repo_owner": repo_owner,
        "repo_name": repo_name,
        "leetcode_path_prefix": leetcode_path_prefix,
        "webhook_created": webhook_ok,
        "sync_started": True,
    }


@router.post("/sync")
async def sync_now(current_user: dict = Depends(get_current_user)):
    """Incremental sync: only process new commits since last sync. Fast."""
    count = await process_new_commits_for_user(current_user["id"])
    return {"placards_created_or_updated": count}


@router.post("/resync")
async def resync(
    body: dict = None,
    current_user: dict = Depends(get_current_user),
):
    """Smart resync: re-process only cards missing content. Runs in background.

    Pass {"force": true} to force a full resync of everything.
    """
    from app.placard_service import (
        smart_resync_background,
        full_resync_background,
        get_incomplete_placards,
        get_resync_progress,
    )

    user_id = current_user["id"]

    progress = await get_resync_progress(user_id)
    if progress and progress.get("status") == "running":
        return {
            "status": "already_running",
            "total": progress.get("total", 0),
            "completed": progress.get("completed", 0),
            "current": progress.get("current", ""),
        }

    force = (body or {}).get("force", False)

    if force:
        asyncio.create_task(full_resync_background(user_id))
        return {"status": "started", "mode": "full"}
    else:
        incomplete = await get_incomplete_placards(user_id)
        if not incomplete:
            return {"status": "done", "total": 0, "completed": 0, "message": "All cards already have content."}
        asyncio.create_task(smart_resync_background(user_id))
        return {"status": "started", "mode": "smart", "cards_to_process": len(incomplete)}


@router.get("/resync/status")
async def resync_status(current_user: dict = Depends(get_current_user)):
    """Poll resync progress."""
    from app.placard_service import get_resync_progress

    progress = await get_resync_progress(current_user["id"])
    if not progress:
        return {"status": "idle", "total": 0, "completed": 0, "current": ""}
    return progress

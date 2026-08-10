"""GitHub webhook: push events create placards for the repo owner."""

import hashlib
import hmac
import json
import logging

from fastapi import APIRouter, Request, HTTPException, Response

from app.config import get_settings
from app.user_service import get_user_by_repo
from app.placard_service import process_new_commits_for_user

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)


def _verify_signature(payload: bytes, signature: str | None) -> bool:
    """Verify X-Hub-Signature-256 from GitHub."""
    secret = (get_settings().GITHUB_WEBHOOK_SECRET or "").encode("utf-8")
    if not secret:
        return True  # No secret configured: allow (dev only)
    if not signature or not signature.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(secret, payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/github")
async def github_webhook(request: Request):
    """
    GitHub push webhook. Finds user by repo, then processes new commits
    and creates/updates placards for new LeetCode files.
    """
    body = await request.body()
    sig = request.headers.get("X-Hub-Signature-256")
    if not _verify_signature(body, sig):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    repo = data.get("repository") or {}
    # Use the repo's own default branch rather than assuming main/master.
    default_branch = repo.get("default_branch") or "main"
    if data.get("ref") != f"refs/heads/{default_branch}":
        return Response(status_code=200, content=b"ok")

    full_name = repo.get("full_name") or ""
    if "/" not in full_name:
        return Response(status_code=200, content=b"ok")
    owner, repo_name = full_name.split("/", 1)

    user = await get_user_by_repo(owner, repo_name)
    if not user:
        logger.info("Webhook: no user connected for repo %s", full_name)
        return Response(status_code=200, content=b"ok")

    user_id = user["id"]
    try:
        count = await process_new_commits_for_user(user_id)
        if count > 0:
            logger.info("Webhook: created/updated %d placard(s) for user %s", count, user_id)
    except Exception as e:
        logger.exception("Webhook processing failed: %s", e)
        # Return 200 so GitHub doesn't retry forever
    return Response(status_code=200, content=b"ok")

"""User CRUD and lookup for GitHub OAuth users."""

import logging
from typing import Optional
from uuid import UUID

from app.database import get_conn

logger = logging.getLogger(__name__)


async def get_user_by_id(user_id: UUID) -> Optional[dict]:
    """Get user by primary key."""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT id, github_id, username, repo_owner, repo_name, leetcode_path_prefix, created_at FROM users WHERE id = $1",
            user_id,
        )
        return dict(row) if row else None


async def get_user_by_github_id(github_id: int) -> Optional[dict]:
    """Get user by GitHub ID (includes access_token for API calls)."""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT id, github_id, username, access_token, repo_owner, repo_name, leetcode_path_prefix FROM users WHERE github_id = $1",
            github_id,
        )
        return dict(row) if row else None


async def get_user_by_repo(owner: str, repo: str) -> Optional[dict]:
    """Find user who has this repo connected (for webhook)."""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT id, github_id, username, access_token, repo_owner, repo_name, leetcode_path_prefix FROM users WHERE repo_owner = $1 AND repo_name = $2",
            owner,
            repo,
        )
        return dict(row) if row else None


async def upsert_user(
    github_id: int,
    username: str,
    access_token: str,
) -> dict:
    """Create or update user from GitHub OAuth. Returns user row (with id)."""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO users (github_id, username, access_token, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (github_id) DO UPDATE SET
                username = EXCLUDED.username,
                access_token = EXCLUDED.access_token,
                updated_at = NOW()
            RETURNING id, github_id, username, repo_owner, repo_name, leetcode_path_prefix, created_at
            """,
            github_id,
            username,
            access_token,
        )
        return dict(row)


async def set_user_repo(user_id: UUID, repo_owner: str, repo_name: str, leetcode_path_prefix: str = "LeetCode") -> None:
    """Connect a repo to the user (for webhook and sync)."""
    async with get_conn() as conn:
        await conn.execute(
            """
            UPDATE users SET repo_owner = $1, repo_name = $2, leetcode_path_prefix = $3, updated_at = NOW()
            WHERE id = $4
            """,
            repo_owner,
            repo_name,
            leetcode_path_prefix or "LeetCode",
            user_id,
        )

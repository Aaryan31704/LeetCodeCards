"""Business logic: create placards from GitHub + LeetCode + LLM and persist to DB.

Supports:
- Incremental sync (only new commits)
- Smart resync (only cards missing content)
- Background processing with progress tracking
"""

import asyncio
import json
import logging
import time
from typing import Optional
from uuid import UUID

from app.database import get_conn
from app.github_service import (
    get_new_leetcode_files_since,
    list_leetcode_files_at_head,
    get_latest_commit_sha,
    get_file_content,
)
from app.leetcode_service import extract_slug_from_path, fetch_leetcode_problem
from app.llm_service import generate_placard, _extract_problem_name_from_path
from app.user_service import get_user_by_id

logger = logging.getLogger(__name__)

DELAY_BETWEEN_CARDS = 2

# A "running" resync older than this is assumed dead (e.g. the server restarted
# mid-run), so it must not block the user from starting a new one.
STALE_PROGRESS_SECONDS = 600

# asyncio only holds weak references to tasks, so a fire-and-forget task can be
# garbage collected mid-run. Keep strong references until each task finishes.
_background_tasks: set[asyncio.Task] = set()


def spawn_background(coro) -> asyncio.Task:
    """Schedule a background coroutine and keep it alive until completion."""
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return task


def _last_commit_key(user_id: UUID) -> str:
    return f"last_commit:{user_id}"


def _resync_key(user_id: UUID) -> str:
    return f"resync:{user_id}"


# ── Progress helpers ──

async def _set_progress(user_id: UUID, data: dict) -> None:
    # Stamp every write so a resync interrupted by a restart can be detected as
    # stale instead of blocking future resyncs forever.
    data = {**data, "updated_at": time.time()}
    async with get_conn() as conn:
        await conn.execute(
            """
            INSERT INTO worker_state (key, value) VALUES ($1, $2)
            ON CONFLICT (key) DO UPDATE SET value = $2
            """,
            _resync_key(user_id),
            json.dumps(data),
        )


def is_resync_running(progress: Optional[dict]) -> bool:
    """True only for a resync that is running and still reporting progress."""
    if not progress or progress.get("status") != "running":
        return False
    updated_at = progress.get("updated_at")
    if not isinstance(updated_at, (int, float)):
        return False
    return (time.time() - updated_at) < STALE_PROGRESS_SECONDS


async def get_resync_progress(user_id: UUID) -> Optional[dict]:
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT value FROM worker_state WHERE key = $1",
            _resync_key(user_id),
        )
        if not row:
            return None
        try:
            return json.loads(row["value"])
        except (json.JSONDecodeError, TypeError):
            return None


# ── Commit tracking ──

async def get_last_processed_commit(user_id: UUID) -> Optional[str]:
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT value FROM worker_state WHERE key = $1", _last_commit_key(user_id)
        )
        return row["value"] if row else None


async def set_last_processed_commit(user_id: UUID, sha: str) -> None:
    async with get_conn() as conn:
        await conn.execute(
            """
            INSERT INTO worker_state (key, value) VALUES ($1, $2)
            ON CONFLICT (key) DO UPDATE SET value = $2
            """,
            _last_commit_key(user_id),
            sha,
        )


# ── Upsert ──

# Everything a placard carries beyond its identity. One list drives the insert,
# the conflict update, and the read query so the three cannot drift apart.
CONTENT_FIELDS = (
    "statement",
    "description",
    "example",
    "plain_explanation",
    "dry_run",
    "naive_approach",
    "invariant",
    "pseudocode",
    "pattern",
    "core_insight",
    "approach",
    "better_approach",
    "user_approach",
    "optimization_verdict",
    "user_time_complexity",
    "user_space_complexity",
    "better_time_complexity",
    "better_space_complexity",
)

_UPSERT_COLUMNS = ("user_id", "problem_name", "github_file_path", "difficulty", "code", *CONTENT_FIELDS)

_UPSERT_SQL = """
    INSERT INTO placards ({columns})
    VALUES ({placeholders})
    ON CONFLICT (user_id, github_file_path)
    DO UPDATE SET
        problem_name = EXCLUDED.problem_name,
        difficulty = EXCLUDED.difficulty,
        code = EXCLUDED.code,
        {updates}
    RETURNING id
""".format(
    columns=", ".join(_UPSERT_COLUMNS),
    placeholders=", ".join(f"${i}" for i in range(1, len(_UPSERT_COLUMNS) + 1)),
    # A failed generation sends NULL, so COALESCE keeps the last good text
    # rather than blanking a card that was already complete.
    updates=",\n        ".join(
        f"{field} = COALESCE(EXCLUDED.{field}, placards.{field})" for field in CONTENT_FIELDS
    ),
)


async def upsert_placard(
    user_id: UUID,
    problem_name: str,
    github_file_path: str,
    difficulty: str,
    code: str,
    content: dict,
) -> UUID:
    values = [
        user_id,
        problem_name,
        github_file_path,
        difficulty or "Medium",
        code or None,
        *((content.get(field) or None) for field in CONTENT_FIELDS),
    ]
    async with get_conn() as conn:
        row = await conn.fetchrow(_UPSERT_SQL, *values)
        return row["id"]


async def seed_discovered_placards(
    user_id: UUID, files_with_content: list[tuple[str, str]]
) -> None:
    """Persist discovered code before slower LeetCode/LLM enrichment.

    Users should see their repository contents immediately even if an external
    enrichment service is slow or the free Render process restarts mid-sync.
    Existing generated teaching content is deliberately preserved.
    """
    if not files_with_content:
        return
    async with get_conn() as conn:
        await conn.executemany(
            """
            INSERT INTO placards (
                user_id, problem_name, github_file_path, difficulty, code
            )
            VALUES ($1, $2, $3, 'Medium', $4)
            ON CONFLICT (user_id, github_file_path)
            DO UPDATE SET
                problem_name = EXCLUDED.problem_name,
                code = EXCLUDED.code
            """,
            [
                (user_id, _extract_problem_name_from_path(path), path, code)
                for path, code in files_with_content
            ],
        )


async def clear_invalid_path_prefix(
    user_id: UUID, prefix: str, files_with_content: list[tuple[str, str]]
) -> bool:
    """Drop a stale prefix when discovery had to fall back to the repo root."""
    normalized = prefix.strip().strip("/\\").lower()
    if not normalized or not any(
        not path.lower().startswith(normalized + "/")
        for path, _ in files_with_content
    ):
        return False
    async with get_conn() as conn:
        await conn.execute(
            "UPDATE users SET leetcode_path_prefix = '', updated_at = NOW() WHERE id = $1",
            user_id,
        )
    logger.info("Cleared non-matching path prefix %r for user %s", prefix, user_id)
    return True


# ── Process a single placard ──

async def _process_one(
    user_id: UUID,
    path: str,
    code: str,
) -> bool:
    """Fetch LeetCode data + run LLM for one file. Returns True on success."""
    problem_name = _extract_problem_name_from_path(path)

    slug = extract_slug_from_path(path)
    lc_problem = None
    if slug:
        lc_problem = await fetch_leetcode_problem(slug)

    lc_title = (lc_problem or {}).get("title") or problem_name
    lc_difficulty = (lc_problem or {}).get("difficulty") or "Medium"
    lc_content = (lc_problem or {}).get("content") or None

    placard = await generate_placard(
        problem_name=lc_title,
        code=code,
        github_file_path=path,
        leetcode_content=lc_content,
        leetcode_difficulty=lc_difficulty,
    )

    await upsert_placard(
        user_id=user_id,
        problem_name=placard["problem_name"],
        github_file_path=placard["github_file_path"],
        difficulty=placard.get("difficulty") or "Medium",
        code=placard.get("code") or "",
        content=placard,
    )
    return True


# ── Incremental sync (new commits only) ──

async def process_new_commits_for_user(user_id: UUID) -> int:
    user = await get_user_by_id(user_id)
    if not user:
        return 0
    owner = user.get("repo_owner")
    repo = user.get("repo_name")
    if not owner or not repo:
        return 0

    from app.user_service import get_user_by_github_id
    full_user = await get_user_by_github_id(user["github_id"])
    token = (full_user or {}).get("access_token")
    raw_prefix = user.get("leetcode_path_prefix")
    prefix = raw_prefix.strip() if raw_prefix else ""

    last_sha = await get_last_processed_commit(user_id)
    files_with_content = await get_new_leetcode_files_since(
        owner, repo, last_sha, token=token, leetcode_path_prefix=prefix
    )
    if not files_with_content:
        async with get_conn() as conn:
            existing = await conn.fetchval(
                "SELECT COUNT(*) FROM placards WHERE user_id = $1", user_id
            )
        # First import often saved the HEAD sha after matching 0 files because
        # the default LeetCode/ prefix missed LeetHub files at the repo root.
        if last_sha and not existing:
            discovered = await list_leetcode_files_at_head(
                owner, repo, token=token, leetcode_path_prefix=prefix
            )
            if discovered:
                await clear_invalid_path_prefix(user_id, prefix, discovered)
                await seed_discovered_placards(user_id, discovered)
            progress = await get_resync_progress(user_id)
            if not is_resync_running(progress):
                logger.info(
                    "User %s has 0 cards; starting full import of %s/%s",
                    user_id, owner, repo,
                )
                spawn_background(full_resync_background(user_id))
            return len(discovered)
        if not files_with_content:
            latest = await get_latest_commit_sha(owner, repo, token)
            if latest:
                await set_last_processed_commit(user_id, latest)
            return 0

    await clear_invalid_path_prefix(user_id, prefix, files_with_content)
    await seed_discovered_placards(user_id, files_with_content)
    total = len(files_with_content)
    logger.info("User %s: %d new file(s) to process", user_id, total)
    count = 0
    failed = 0
    for index, (path, code) in enumerate(files_with_content):
        try:
            await _process_one(user_id, path, code)
            count += 1
        except Exception as e:
            failed += 1
            logger.warning("Failed to process %s: %s", path, e)
        if index < total - 1:
            await asyncio.sleep(DELAY_BETWEEN_CARDS)

    # Only advance the pointer when everything succeeded, otherwise failed files
    # would be skipped forever on subsequent syncs.
    if failed:
        logger.warning(
            "User %s: %d/%d file(s) failed; keeping commit pointer so they retry next sync",
            user_id, failed, total,
        )
    else:
        latest = await get_latest_commit_sha(owner, repo, token)
        if latest:
            await set_last_processed_commit(user_id, latest)
    return count


# ── Smart resync (only incomplete cards) ──

async def clear_deck_for_user(user_id: UUID) -> None:
    """Drop this user's cards and commit cursor so a new repo starts clean."""
    async with get_conn() as conn:
        await conn.execute("DELETE FROM placards WHERE user_id = $1", user_id)
        await conn.execute(
            "DELETE FROM worker_state WHERE key = $1",
            _last_commit_key(user_id),
        )
    logger.info("Cleared deck for user %s after repo change", user_id)


async def get_incomplete_placards(user_id: UUID) -> list[dict]:
    """Find cards with missing, failed, or legacy malformed teaching content.

    Only content a lesson cannot work without is listed. The optional extras
    (naive approach, invariant, pseudocode) are deliberately absent: a problem
    the model declines to expand on would otherwise be re-queued on every
    resync forever. The statement and its example are excluded for the same
    reason, since a file whose LeetCode slug cannot be resolved will never gain
    one; such cards fall back to the plain explanation, which is checked here.
    """
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT id, problem_name, github_file_path, code
            FROM placards
            WHERE user_id = $1
              AND (
                length(COALESCE(approach, '')) < 15
                OR approach LIKE 'Set a valid%'
                OR approach LIKE 'Approach not available%'
                OR approach = 'See code.'
                OR approach LIKE '[%'
                OR COALESCE(pattern, '') = ''
                OR length(COALESCE(core_insight, '')) < 20
                OR length(COALESCE(user_approach, '')) < 30
                OR COALESCE(optimization_verdict, '') = ''
                OR length(COALESCE(plain_explanation, '')) < 20
                OR length(COALESCE(dry_run, '')) < 40
              )
            ORDER BY created_at
            """,
            user_id,
        )
        return [dict(r) for r in rows]


async def smart_resync_background(user_id: UUID) -> None:
    """Background task: re-process only incomplete cards with progress tracking."""
    try:
        incomplete = await get_incomplete_placards(user_id)
        total = len(incomplete)

        if total == 0:
            await _set_progress(user_id, {"status": "done", "total": 0, "completed": 0, "current": ""})
            return

        await _set_progress(user_id, {"status": "running", "total": total, "completed": 0, "current": ""})

        user = await get_user_by_id(user_id)
        owner = user.get("repo_owner") if user else None
        repo = user.get("repo_name") if user else None

        from app.user_service import get_user_by_github_id
        full_user = await get_user_by_github_id(user["github_id"]) if user else None
        token = (full_user or {}).get("access_token")

        completed = 0
        for card in incomplete:
            name = card["problem_name"]
            path = card["github_file_path"]
            code = card.get("code") or ""

            await _set_progress(user_id, {
                "status": "running",
                "total": total,
                "completed": completed,
                "current": name,
            })

            if not code and owner and repo:
                code = await get_file_content(owner, repo, path, token) or ""

            try:
                await _process_one(user_id, path, code)
            except Exception as e:
                logger.warning("Resync failed for %s: %s", path, e)

            completed += 1

            if completed < total:
                await asyncio.sleep(DELAY_BETWEEN_CARDS)

        await _set_progress(user_id, {
            "status": "done",
            "total": total,
            "completed": completed,
            "current": "",
        })
        logger.info("Smart resync complete for user %s: %d/%d cards", user_id, completed, total)

    except Exception as e:
        logger.exception("Smart resync crashed for user %s: %s", user_id, e)
        await _set_progress(user_id, {
            "status": "error",
            "total": 0,
            "completed": 0,
            "current": str(e),
        })


async def full_resync_background(user_id: UUID) -> None:
    """Background task: clear commit state, re-fetch all files, re-process everything."""
    try:
        async with get_conn() as conn:
            await conn.execute(
                "DELETE FROM worker_state WHERE key = $1",
                _last_commit_key(user_id),
            )

        user = await get_user_by_id(user_id)
        if not user:
            await _set_progress(user_id, {"status": "error", "total": 0, "completed": 0, "current": "User not found"})
            return

        owner = user.get("repo_owner")
        repo = user.get("repo_name")
        if not owner or not repo:
            await _set_progress(user_id, {"status": "error", "total": 0, "completed": 0, "current": "No repo connected"})
            return

        from app.user_service import get_user_by_github_id
        full_user = await get_user_by_github_id(user["github_id"])
        token = (full_user or {}).get("access_token")
        raw_prefix = user.get("leetcode_path_prefix")
        prefix = raw_prefix.strip() if raw_prefix else ""

        await _set_progress(user_id, {"status": "running", "total": 0, "completed": 0, "current": "Fetching files..."})

        files_with_content = await get_new_leetcode_files_since(
            owner, repo, None, token=token, leetcode_path_prefix=prefix
        )
        total = len(files_with_content)
        if total == 0:
            await _set_progress(user_id, {
                "status": "error",
                "total": 0,
                "completed": 0,
                "current": (
                    "No supported solution files were found. Check the repo name, "
                    "GitHub access, and optional path prefix."
                ),
            })
            return

        await clear_invalid_path_prefix(user_id, prefix, files_with_content)
        await seed_discovered_placards(user_id, files_with_content)
        await _set_progress(user_id, {"status": "running", "total": total, "completed": 0, "current": ""})

        completed = 0
        failed = 0
        for path, code in files_with_content:
            name = _extract_problem_name_from_path(path)
            await _set_progress(user_id, {
                "status": "running", "total": total, "completed": completed, "current": name,
            })

            try:
                await _process_one(user_id, path, code)
            except Exception as e:
                failed += 1
                logger.warning("Full resync failed for %s: %s", path, e)

            completed += 1
            if completed < total:
                await asyncio.sleep(DELAY_BETWEEN_CARDS)

        if failed:
            logger.warning(
                "Full resync for user %s: %d/%d file(s) failed; commit pointer not advanced",
                user_id, failed, total,
            )
        else:
            latest = await get_latest_commit_sha(owner, repo, token)
            if latest:
                await set_last_processed_commit(user_id, latest)

        await _set_progress(user_id, {"status": "done", "total": total, "completed": completed, "current": ""})
        logger.info("Full resync complete for user %s: %d/%d", user_id, completed, total)

    except Exception as e:
        logger.exception("Full resync crashed for user %s: %s", user_id, e)
        await _set_progress(user_id, {"status": "error", "total": 0, "completed": 0, "current": str(e)})


# ── Query helpers ──

def _full_select(include_code: bool) -> str:
    """Read every content field. Source code is heavy, so it is opt-in."""
    code = "code" if include_code else "NULL::TEXT AS code"
    columns = ", ".join(
        ("id", "problem_name", "github_file_path", "difficulty", "mastered", "created_at",
         code, *CONTENT_FIELDS)
    )
    return f"SELECT {columns} FROM placards"


async def list_placards(user_id: UUID) -> list[dict]:
    async with get_conn() as conn:
        rows = await conn.fetch(
            "SELECT id, problem_name, difficulty, pattern, mastered, created_at "
            "FROM placards WHERE user_id = $1 ORDER BY created_at DESC",
            user_id,
        )
        return [dict(r) for r in rows]


async def list_placards_full(user_id: UUID, include_code: bool = False) -> list[dict]:
    async with get_conn() as conn:
        rows = await conn.fetch(
            _full_select(include_code) + " WHERE user_id = $1 ORDER BY created_at DESC",
            user_id,
        )
        return [dict(r) for r in rows]


async def get_placard_by_id(placard_id: UUID, user_id: UUID) -> Optional[dict]:
    async with get_conn() as conn:
        row = await conn.fetchrow(
            _full_select(include_code=True) + " WHERE id = $1 AND user_id = $2",
            placard_id, user_id,
        )
        return dict(row) if row else None


async def toggle_mastered(placard_id: UUID, user_id: UUID) -> Optional[bool]:
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            UPDATE placards SET mastered = NOT mastered
            WHERE id = $1 AND user_id = $2
            RETURNING mastered
            """,
            placard_id, user_id,
        )
        return row["mastered"] if row else None

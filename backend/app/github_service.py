"""GitHub REST API integration: fetch commits and file contents."""

import logging
from typing import Optional

import httpx

from app.config import get_settings

GITHUB_API_BASE = "https://api.github.com"
logger = logging.getLogger(__name__)

# Bound history walking so a missing/rewritten since_sha cannot page through an entire repo.
MAX_COMMIT_PAGES = 20


def _headers(token: Optional[str] = None) -> dict:
    settings = get_settings()
    t = token or settings.GITHUB_TOKEN
    headers = {"Accept": "application/vnd.github.v3+json"}
    if t:
        headers["Authorization"] = f"Bearer {t}"
    return headers


def _is_leetcode_file(path: str, path_prefix: Optional[str] = None) -> bool:
    """Check if path looks like a LeetCode solution. path_prefix overrides settings."""
    settings = get_settings()
    if not path:
        return False
    ext = path.split(".")[-1].lower() if "." in path else ""
    if ext not in settings.LEETCODE_EXTENSIONS:
        return False
    prefix = (path_prefix if path_prefix is not None else settings.LEETCODE_PATH_PREFIX or "").strip()
    if not prefix:
        return True
    path_lower = path.lower()
    prefix_lower = prefix.lower()
    if not path_lower.startswith(prefix_lower):
        return False
    rest = path[len(prefix) :].lstrip("/\\")
    return bool(rest)


def _client() -> httpx.AsyncClient:
    """HTTP client that follows redirects (GitHub returns 301 for case-normalized owner/repo)."""
    return httpx.AsyncClient(timeout=30, follow_redirects=True)


async def get_latest_commit_sha(owner: str, repo: str, token: Optional[str] = None) -> Optional[str]:
    """Get the SHA of the latest commit on default branch."""
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/commits"
    async with _client() as client:
        r = await client.get(url, params={"per_page": 1}, headers=_headers(token))
        if r.status_code != 200:
            return None
        data = r.json()
        if not data:
            return None
        return data[0].get("sha")


async def get_commits_since(
    owner: str, repo: str, since_sha: Optional[str], token: Optional[str] = None
) -> list[dict]:
    """
    Fetch commits. If since_sha is set, return commits until we hit that SHA (newest first).
    Returns list of {sha, commit message, files...} - we need to get files from each commit.
    """
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/commits"
    params = {"per_page": 30}
    result = []
    async with _client() as client:
        page = 1
        while page <= MAX_COMMIT_PAGES:
            r = await client.get(
                url, params={**params, "page": page}, headers=_headers(token)
            )
            if r.status_code != 200:
                logger.warning(
                    "Failed to list commits for %s/%s: %s %s",
                    owner, repo, r.status_code, r.text[:200],
                )
                break
            commits = r.json()
            if not commits:
                break
            for c in commits:
                sha = c.get("sha")
                if sha == since_sha:
                    return result
                result.append(
                    {
                        "sha": sha,
                        "message": (c.get("commit") or {}).get("message") or "",
                    }
                )
            if len(commits) < params["per_page"]:
                break
            page += 1
    return result


async def get_commit_files(owner: str, repo: str, sha: str, token: Optional[str] = None) -> list[dict]:
    """Get list of files changed in a commit (from commit details)."""
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/commits/{sha}"
    async with _client() as client:
        r = await client.get(url, headers=_headers(token))
        if r.status_code != 200:
            return []
        data = r.json()
        files = data.get("files") or []
        return [{"filename": f.get("filename"), "status": f.get("status")} for f in files]


async def get_file_content(
    owner: str, repo: str, path: str, token: Optional[str] = None
) -> Optional[str]:
    """Get raw file content from repo."""
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}"
    async with _client() as client:
        r = await client.get(
            url, headers={**_headers(token), "Accept": "application/vnd.github.raw"}
        )
        if r.status_code != 200:
            return None
        return r.text


async def get_new_leetcode_files_since(
    owner: str,
    repo: str,
    last_processed_sha: Optional[str],
    token: Optional[str] = None,
    leetcode_path_prefix: Optional[str] = None,
) -> list[tuple[str, str]]:
    """
    Returns list of (file_path, file_content) for LeetCode solution files
    in commits after last_processed_sha.
    """
    commits = await get_commits_since(owner, repo, last_processed_sha, token)
    seen_paths = set()
    out = []
    for c in commits:
        sha = c["sha"]
        files = await get_commit_files(owner, repo, sha, token)
        for f in files:
            path = f.get("filename")
            if not path or path in seen_paths:
                continue
            if f.get("status") == "removed":
                continue
            if not _is_leetcode_file(path, leetcode_path_prefix):
                continue
            content = await get_file_content(owner, repo, path, token)
            if content:
                seen_paths.add(path)
                out.append((path, content))
    return out


async def create_webhook_for_repo(
    repo_owner: str, repo_name: str, access_token: str
) -> bool:
    """Ensure a push webhook pointing at this backend exists for the repo.

    Idempotent: reconnecting the same repo updates the existing hook instead of
    failing with a duplicate-hook error from GitHub.
    """
    settings = get_settings()
    webhook_url = f"{settings.APP_URL.rstrip('/')}/webhooks/github"

    if settings.APP_URL.startswith(("http://localhost", "http://127.0.0.1")):
        logger.warning(
            "APP_URL is %s, which GitHub cannot reach. Skipping webhook creation; "
            "use a public URL (e.g. ngrok) to enable push-triggered syncing.",
            settings.APP_URL,
        )
        return False

    config = {"url": webhook_url, "content_type": "json"}
    if settings.GITHUB_WEBHOOK_SECRET:
        config["secret"] = settings.GITHUB_WEBHOOK_SECRET

    hooks_url = f"{GITHUB_API_BASE}/repos/{repo_owner}/{repo_name}/hooks"
    payload = {"name": "web", "active": True, "events": ["push"], "config": config}
    headers = _headers(access_token)

    async with _client() as client:
        existing = await client.get(hooks_url, headers=headers)
        if existing.status_code == 200:
            for hook in existing.json():
                if (hook.get("config") or {}).get("url") == webhook_url:
                    patch = await client.patch(
                        f"{hooks_url}/{hook.get('id')}", json=payload, headers=headers
                    )
                    if patch.status_code == 200:
                        logger.info("Updated existing webhook for %s/%s", repo_owner, repo_name)
                        return True
                    logger.warning(
                        "Failed to update webhook: %s %s", patch.status_code, patch.text[:300]
                    )
                    return False

        r = await client.post(hooks_url, json=payload, headers=headers)
        if r.status_code in (200, 201):
            logger.info("Created webhook for %s/%s", repo_owner, repo_name)
            return True
        logger.warning("Failed to create webhook: %s %s", r.status_code, r.text[:300])
        return False

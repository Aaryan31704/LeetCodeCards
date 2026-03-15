"""GitHub OAuth: login and callback."""

from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
import httpx

from app.config import get_settings
from app.auth import create_token
from app.user_service import upsert_user

router = APIRouter(prefix="/auth", tags=["auth"])

GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"


@router.get("/github")
async def auth_github():
    """Redirect user to GitHub OAuth authorization page."""
    settings = get_settings()
    if not settings.GITHUB_OAUTH_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="GitHub OAuth not configured. Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET in backend .env",
        )
    redirect_uri = f"{settings.APP_URL.rstrip('/')}/auth/github/callback"
    params = {
        "client_id": settings.GITHUB_OAUTH_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "scope": "read:user user:email repo admin:repo_hook",
    }
    url = "https://github.com/login/oauth/authorize?" + urlencode(params)
    return RedirectResponse(url=url)


@router.get("/github/callback")
async def auth_github_callback(code: str | None = None, error: str | None = None):
    """Exchange code for token, create/update user, redirect to app with JWT."""
    settings = get_settings()
    if error:
        # Redirect to app with error (e.g. user denied)
        redirect_url = _app_redirect_url(error=error)
        return RedirectResponse(url=redirect_url)

    if not code:
        raise HTTPException(status_code=400, detail="Missing code")

    redirect_uri = f"{settings.APP_URL.rstrip('/')}/auth/github/callback"
    async with httpx.AsyncClient() as client:
        r = await client.post(
            GITHUB_TOKEN_URL,
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.GITHUB_OAUTH_CLIENT_ID,
                "client_secret": settings.GITHUB_OAUTH_CLIENT_SECRET,
                "code": code,
                "redirect_uri": redirect_uri,
            },
        )
    if r.status_code != 200:
        redirect_url = _app_redirect_url(error="token_exchange_failed")
        return RedirectResponse(url=redirect_url)

    data = r.json()
    access_token = data.get("access_token")
    if not access_token:
        redirect_url = _app_redirect_url(error="no_access_token")
        return RedirectResponse(url=redirect_url)

    # Fetch GitHub user
    async with httpx.AsyncClient() as client:
        r2 = await client.get(
            GITHUB_USER_URL,
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github.v3+json"},
        )
    if r2.status_code != 200:
        redirect_url = _app_redirect_url(error="user_fetch_failed")
        return RedirectResponse(url=redirect_url)

    gh_user = r2.json()
    github_id = gh_user.get("id")
    username = gh_user.get("login") or gh_user.get("name") or str(github_id)
    if not github_id:
        redirect_url = _app_redirect_url(error="invalid_user")
        return RedirectResponse(url=redirect_url)

    user = await upsert_user(github_id=github_id, username=username, access_token=access_token)
    token = create_token(user["id"], github_id)
    redirect_url = _app_redirect_url(token=token)
    return RedirectResponse(url=redirect_url)


def _app_redirect_url(token: str | None = None, error: str | None = None) -> str:
    """Build deep link to Expo app: leetplacards://auth/callback?token=... or ?error=..."""
    settings = get_settings()
    scheme = (settings.AUTH_REDIRECT_SCHEME or "leetplacards").rstrip("://")
    host = (settings.AUTH_REDIRECT_HOST or "").strip()
    if host:
        path = "auth/callback"
        base = f"{scheme}://{host}/{path}" if not host.startswith("http") else f"{host}/{path}"
    else:
        base = f"{scheme}://auth/callback"
    params = {}
    if token:
        params["token"] = token
    if error:
        params["error"] = error
    if params:
        base = base + "?" + urlencode(params)
    return base

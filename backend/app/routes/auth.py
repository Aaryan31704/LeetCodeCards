"""GitHub OAuth: login and callback.

The mobile app passes its own deep-link redirect URL via the `state` parameter
so the backend can redirect back correctly regardless of whether the app is
running on LAN (exp://192.168...) or via Expo tunnel (exp://u.expo.dev/...).
"""

import json
import base64
from urllib.parse import urlencode, unquote

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse
import httpx

from app.config import get_settings
from app.auth import create_token
from app.user_service import upsert_user

router = APIRouter(prefix="/auth", tags=["auth"])

GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"


def _encode_state(app_redirect: str) -> str:
    """Encode the mobile app's redirect URL into the OAuth state parameter."""
    payload = json.dumps({"r": app_redirect})
    return base64.urlsafe_b64encode(payload.encode()).decode()


def _decode_state(state: str) -> str | None:
    """Decode the app redirect URL from the OAuth state parameter."""
    try:
        payload = json.loads(base64.urlsafe_b64decode(state))
        return payload.get("r")
    except Exception:
        return None


@router.get("/github")
async def auth_github(app_redirect: str | None = Query(None)):
    """Redirect user to GitHub OAuth authorization page.

    The mobile app should pass `app_redirect` — its own deep-link URL that the
    backend will redirect to after authentication completes.
    """
    settings = get_settings()
    if not settings.GITHUB_OAUTH_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="GitHub OAuth not configured. Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET in backend .env",
        )
    redirect_uri = f"{settings.APP_URL.rstrip('/')}/auth/github/callback"

    state = ""
    if app_redirect:
        state = _encode_state(unquote(app_redirect))

    params = {
        "client_id": settings.GITHUB_OAUTH_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "scope": "read:user user:email repo admin:repo_hook",
    }
    if state:
        params["state"] = state

    url = "https://github.com/login/oauth/authorize?" + urlencode(params)
    return RedirectResponse(url=url)


@router.get("/github/callback")
async def auth_github_callback(
    code: str | None = None,
    error: str | None = None,
    state: str | None = None,
):
    """Exchange code for token, create/update user, redirect to app with JWT."""
    settings = get_settings()

    app_redirect_base = _decode_state(state) if state else None

    if error:
        redirect_url = _build_redirect(app_redirect_base, error=error)
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
        redirect_url = _build_redirect(app_redirect_base, error="token_exchange_failed")
        return RedirectResponse(url=redirect_url)

    data = r.json()
    access_token = data.get("access_token")
    if not access_token:
        redirect_url = _build_redirect(app_redirect_base, error="no_access_token")
        return RedirectResponse(url=redirect_url)

    async with httpx.AsyncClient() as client:
        r2 = await client.get(
            GITHUB_USER_URL,
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github.v3+json"},
        )
    if r2.status_code != 200:
        redirect_url = _build_redirect(app_redirect_base, error="user_fetch_failed")
        return RedirectResponse(url=redirect_url)

    gh_user = r2.json()
    github_id = gh_user.get("id")
    username = gh_user.get("login") or gh_user.get("name") or str(github_id)
    if not github_id:
        redirect_url = _build_redirect(app_redirect_base, error="invalid_user")
        return RedirectResponse(url=redirect_url)

    user = await upsert_user(github_id=github_id, username=username, access_token=access_token)
    token = create_token(user["id"], github_id)
    redirect_url = _build_redirect(app_redirect_base, token=token)
    return RedirectResponse(url=redirect_url)


def _build_redirect(
    app_redirect_base: str | None = None,
    token: str | None = None,
    error: str | None = None,
) -> str:
    """Build the final redirect URL back to the mobile app.

    If `app_redirect_base` was passed from the mobile app, use it directly.
    Otherwise fall back to the .env configured scheme/host.
    """
    if app_redirect_base:
        base = app_redirect_base.rstrip("?&")
    else:
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
    separator = "&" if "?" in base else "?"
    if params:
        base = base + separator + urlencode(params)
    return base

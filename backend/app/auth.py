"""JWT creation and verification for API auth."""

import uuid
from datetime import datetime, timedelta, timezone

import jwt

from app.config import get_settings


def create_token(user_id: uuid.UUID, github_id: int) -> str:
    """Create a JWT for the user. Used after GitHub OAuth."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "github_id": github_id,
        "iat": now,
        "exp": now + timedelta(days=settings.JWT_EXPIRE_DAYS),
    }
    return jwt.encode(
        payload,
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )


def verify_token(token: str) -> dict | None:
    """Verify JWT and return payload with sub (user_id). Returns None if invalid."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except jwt.InvalidTokenError:
        return None

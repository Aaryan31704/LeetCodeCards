"""Application configuration loaded from environment variables."""

import os
from pathlib import Path
from functools import lru_cache

from dotenv import load_dotenv

# Load .env from backend directory so it works when run from project root or backend/
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)
load_dotenv()  # Also load from current working directory

DEFAULT_JWT_SECRET = "change-me-in-production"


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


@lru_cache
def get_settings():
    return Settings()


class Settings:
    """Settings for LeetPlacards backend."""

    # API
    API_TITLE: str = "LeetPlacards API"
    API_VERSION: str = "1.0.0"
    # When true, error responses include exception details. Never enable in production.
    DEBUG: bool = _env_bool("DEBUG", False)

    # Database (Supabase PostgreSQL)
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "",  # e.g. postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
    )

    # GitHub. Optional fallback token for unauthenticated reads of public repos.
    GITHUB_TOKEN: str = os.getenv("GITHUB_TOKEN", "")

    # Groq LLM. llama-3.x models are decommissioned; see console.groq.com/docs/deprecations
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

    # LeetCode file patterns (e.g. LeetHub pushes to paths like "LeetCode/123-problem-name.py")
    LEETCODE_PATH_PREFIX: str = os.getenv("LEETCODE_PATH_PREFIX", "LeetCode")
    LEETCODE_EXTENSIONS: tuple = ("py", "java", "js", "ts", "cpp", "go", "rs")

    # GitHub OAuth (for "Login with GitHub")
    GITHUB_OAUTH_CLIENT_ID: str = os.getenv("GITHUB_OAUTH_CLIENT_ID", "")
    GITHUB_OAUTH_CLIENT_SECRET: str = os.getenv("GITHUB_OAUTH_CLIENT_SECRET", "")
    # URL of this backend (e.g. https://api.yourapp.com) for OAuth redirect_uri
    APP_URL: str = os.getenv("APP_URL", "http://localhost:8000")
    # Deep link for Expo app after login (e.g. exp://192.168.1.100:8081 or leetplacards://auth)
    AUTH_REDIRECT_SCHEME: str = os.getenv("AUTH_REDIRECT_SCHEME", "leetplacards")
    AUTH_REDIRECT_HOST: str = os.getenv("AUTH_REDIRECT_HOST", "")
    # Only these URL schemes may receive the post-login token, to prevent open redirects.
    ALLOWED_REDIRECT_SCHEMES: list = _env_list(
        "ALLOWED_REDIRECT_SCHEMES",
        [AUTH_REDIRECT_SCHEME, "exp", "exps", "expo-development-client"],
    )

    # CORS. Defaults to "*" since the Expo app sends Bearer tokens, not cookies.
    CORS_ALLOW_ORIGINS: list = _env_list("CORS_ALLOW_ORIGINS", ["*"])

    # JWT for API auth
    JWT_SECRET: str = os.getenv("JWT_SECRET", DEFAULT_JWT_SECRET)
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_DAYS: int = _env_int("JWT_EXPIRE_DAYS", 30)

    # Webhook secret to verify GitHub push events (set in GitHub repo webhook config)
    GITHUB_WEBHOOK_SECRET: str = os.getenv("GITHUB_WEBHOOK_SECRET", "")

    def config_warnings(self) -> list[str]:
        """Startup checks for misconfiguration that would fail later at request time."""
        warnings = []

        def unset(value: str) -> bool:
            """True when a value is blank or still the .env.example placeholder."""
            if not value:
                return True
            lowered = value.strip().lower()
            return lowered.startswith("your_") or "xxxx" in lowered or "PASSWORD" in value

        if unset(self.DATABASE_URL):
            warnings.append(
                "DATABASE_URL is not set to a real connection string; all data endpoints "
                "will fail with 503. Copy it from Supabase -> Project Settings -> Database."
            )
        if self.JWT_SECRET == DEFAULT_JWT_SECRET:
            warnings.append(
                "JWT_SECRET is the default value; anyone can forge tokens. Generate one with "
                'python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )
        if unset(self.GITHUB_OAUTH_CLIENT_ID) or unset(self.GITHUB_OAUTH_CLIENT_SECRET):
            warnings.append("GitHub OAuth is not configured; login will return 503.")
        if unset(self.GROQ_API_KEY):
            warnings.append(
                "GROQ_API_KEY is not set to a real key; placards will have no description "
                "or approach. Get one at https://console.groq.com"
            )
        if not self.GITHUB_WEBHOOK_SECRET:
            warnings.append(
                "GITHUB_WEBHOOK_SECRET is not set; webhook payloads are accepted unverified."
            )
        if self.APP_URL.startswith(("http://localhost", "http://127.0.0.1")):
            warnings.append(
                f"APP_URL is {self.APP_URL}; GitHub cannot reach it, so webhook creation "
                "will fail. Use a public URL (e.g. ngrok) for push-triggered syncing."
            )
        return warnings

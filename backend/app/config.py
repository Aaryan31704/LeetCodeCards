"""Application configuration loaded from environment variables."""

import os
from pathlib import Path
from functools import lru_cache

from dotenv import load_dotenv

# Load .env from backend directory so it works when run from project root or backend/
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)
load_dotenv()  # Also load from current working directory


@lru_cache
def get_settings():
    return Settings()


class Settings:
    """Settings for LeetPlacards backend."""

    # API
    API_TITLE: str = "LeetPlacards API"
    API_VERSION: str = "1.0.0"

    # Database (Supabase PostgreSQL)
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "",  # e.g. postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
    )

    # GitHub
    GITHUB_TOKEN: str = os.getenv("GITHUB_TOKEN", "")
    GITHUB_REPO_OWNER: str = os.getenv("GITHUB_REPO_OWNER", "")
    GITHUB_REPO_NAME: str = os.getenv("GITHUB_REPO_NAME", "")

    # Groq LLM
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "llama-3.1-70b-versatile")

    # Worker
    WORKER_POLL_INTERVAL_SECONDS: int = int(
        os.getenv("WORKER_POLL_INTERVAL_SECONDS", "300")
    )  # 5 minutes

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

    # JWT for API auth
    JWT_SECRET: str = os.getenv("JWT_SECRET", "change-me-in-production")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_DAYS: int = 30

    # Webhook secret to verify GitHub push events (set in GitHub repo webhook config)
    GITHUB_WEBHOOK_SECRET: str = os.getenv("GITHUB_WEBHOOK_SECRET", "")

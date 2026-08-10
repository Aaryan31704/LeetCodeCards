"""LeetPlacards API entrypoint."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.database import init_db, close_db, DatabaseUnavailable
from app.models import (
    CREATE_USERS_SQL,
    CREATE_WORKER_STATE_SQL,
    CREATE_PLACARDS_SQL,
    ALTER_PLACARDS_ADD_USER_SQL,
    MIGRATE_PLACARDS_INDEX_SQL,
    MIGRATE_PLACARDS_V2_SQL,
    MIGRATE_PLACARDS_V3_SQL,
)
from app.routes.auth import router as auth_router
from app.routes.placards import router as placards_router
from app.routes.me import router as me_router
from app.routes.webhooks import router as webhooks_router

logger = logging.getLogger("uvicorn.error")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize DB and run migrations on startup."""
    for warning in settings.config_warnings():
        logger.warning("Config: %s", warning)

    try:
        pool = await init_db()
        if pool:
            async with pool.acquire() as conn:
                await conn.execute(CREATE_USERS_SQL)
                await conn.execute(CREATE_WORKER_STATE_SQL)
                # Migrate existing placards table: add user_id if missing (old schema)
                await conn.execute(ALTER_PLACARDS_ADD_USER_SQL)
                await conn.execute(CREATE_PLACARDS_SQL)
                # Drop old unique index, ensure new (user_id, github_file_path) index exists
                await conn.execute(MIGRATE_PLACARDS_INDEX_SQL)
                await conn.execute(MIGRATE_PLACARDS_V2_SQL)
                await conn.execute(MIGRATE_PLACARDS_V3_SQL)
            logger.info("Database ready")
    except Exception as e:
        logger.warning(
            "Database connection failed at startup: %s. Check DATABASE_URL and network.", e
        )
    yield
    await close_db()


app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    lifespan=lifespan,
)

# Credentials cannot be combined with a wildcard origin; browsers reject the response.
_allow_credentials = "*" not in settings.CORS_ALLOW_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOW_ORIGINS,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(me_router)
app.include_router(placards_router)
app.include_router(webhooks_router)


@app.exception_handler(DatabaseUnavailable)
async def database_unavailable_handler(request: Request, exc: DatabaseUnavailable):
    """A down database is transient, so report 503 rather than an opaque 500."""
    logger.error("Database unavailable on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=503,
        content={"detail": "Database unavailable. Check DATABASE_URL and try again."},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Log the failure and return an opaque 500 so internals are not exposed."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    if settings.DEBUG:
        return JSONResponse(
            status_code=500,
            content={"detail": str(exc), "type": type(exc).__name__},
        )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


@app.get("/health")
async def health():
    return {"status": "ok"}

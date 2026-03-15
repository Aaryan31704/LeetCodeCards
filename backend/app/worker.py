"""Background worker: poll GitHub every 5 minutes and process new commits."""

import asyncio
import logging
import os
import sys

from app.config import get_settings
from app.database import init_db
from app.placard_service import process_new_commits, clear_last_processed_commit

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


async def run_once() -> int:
    """Process new commits once. Returns number of placards created/updated."""
    try:
        count = await process_new_commits()
        if count > 0:
            logger.info("Processed %d new placard(s)", count)
        return count
    except Exception as e:
        logger.exception("Error in run_once: %s", e)
        return 0


async def main() -> None:
    settings = get_settings()
    interval = settings.WORKER_POLL_INTERVAL_SECONDS
    logger.info("Starting worker (poll every %s seconds)", interval)

    await init_db()

    if os.getenv("WORKER_FORCE_RESET", "").strip().lower() in ("1", "true", "yes"):
        await clear_last_processed_commit()
        logger.info("Worker state reset (WORKER_FORCE_RESET). Will reprocess recent commits.")

    while True:
        await run_once()
        await asyncio.sleep(interval)


if __name__ == "__main__":
    asyncio.run(main())

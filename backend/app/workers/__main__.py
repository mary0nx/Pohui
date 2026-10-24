"""Worker process: `python -m app.workers`."""

from __future__ import annotations

import asyncio
import contextlib
import signal

from app.config import get_settings
from app.core.logging import setup_logging
from app.db.session import dispose_engine
from app.workers.loop import run_loop


async def main() -> None:
    settings = get_settings()
    setup_logging(settings.log_level)
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        with contextlib.suppress(NotImplementedError):
            loop.add_signal_handler(sig, stop.set)
    await run_loop(stop)
    await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())

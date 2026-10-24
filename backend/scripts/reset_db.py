"""Drop and recreate the public schema, then run migrations. For disposable test DBs only.

Refuses to run unless APP_ENV is development/test and the database name ends with _e2e or _test.
"""

import asyncio
import os
import subprocess
import sys
from urllib.parse import urlparse

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


async def main() -> None:
    url = os.environ["DATABASE_URL"]
    name = urlparse(url.replace("+asyncpg", "")).path.lstrip("/")
    if os.environ.get("APP_ENV") not in ("development", "test") or not name.endswith(("_e2e", "_test")):
        sys.exit(f"refusing to reset database {name!r}")
    engine = create_async_engine(url)
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
    await engine.dispose()
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True)


asyncio.run(main())

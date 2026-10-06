from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


def _is_memory(url: str) -> bool:
    return url in ("sqlite://", "sqlite:///") or ":memory:" in url


def make_engine(url: str) -> Engine:
    if url.startswith("sqlite:///") and not _is_memory(url):
        Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    kwargs: dict = {}
    if _is_memory(url):
        from sqlalchemy.pool import StaticPool

        kwargs = {"poolclass": StaticPool}
    engine = create_engine(url, connect_args={"check_same_thread": False}, **kwargs)

    @event.listens_for(engine, "connect")
    def _pragmas(dbapi_conn, _):  # type: ignore[no-untyped-def]
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")  # SQLite ignores FKs unless asked
        cur.execute("PRAGMA busy_timeout=5000")
        if not _is_memory(url):
            cur.execute("PRAGMA journal_mode=WAL")
        cur.close()

    return engine


engine = make_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """Request-scoped session. Services call commit(); any escaping error rolls back."""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

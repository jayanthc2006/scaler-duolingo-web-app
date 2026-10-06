from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.db.base import Base
from app.db.session import engine
from app.routers import courses, health, hearts, leaderboard, legendary, lessons, me


@asynccontextmanager
async def lifespan(_: FastAPI):
    import app.models  # noqa: F401  (registers tables on Base.metadata)

    Base.metadata.create_all(engine)
    settings = get_settings()
    if settings.auto_seed:  # idempotent: no-op when a course already exists
        from app.core.clock import get_clock
        from app.db.session import SessionLocal
        from app.seed.seed import seed_database

        with SessionLocal() as db:
            seed_database(db, get_clock().now(), settings)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Sprout API", version="1.0.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)
    api = APIRouter(prefix="/api")
    for r in (health, me, courses, lessons, hearts, leaderboard, legendary):
        api.include_router(r.router)
    app.include_router(api)
    return app


app = create_app()

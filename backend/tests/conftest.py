"""Test harness: fresh in-memory SQLite per test, pinned clock, seeded course + learner."""
from collections.abc import Iterator
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

import app.models  # noqa: F401
from app.core.clock import FixedClock, get_clock
from app.core.config import Settings, get_settings
from app.db.base import Base
from app.db.session import get_db, make_engine
from app.main import create_app
from app.models import Exercise, Lesson, Skill
from app.seed.seed import seed_database

START = datetime(2026, 3, 10, 12, 0, 0)  # a Tuesday, noon UTC


@pytest.fixture
def settings() -> Settings:
    return Settings(database_url="sqlite://", auto_seed=False)


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock(START)


@pytest.fixture
def session_factory(settings, clock) -> Iterator[sessionmaker]:
    engine = make_engine("sqlite://")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as db:
        seed_database(db, clock.now(), settings)
    yield factory
    engine.dispose()


@pytest.fixture
def db(session_factory) -> Iterator[Session]:
    with session_factory() as session:
        yield session


@pytest.fixture
def client(session_factory, settings, clock) -> Iterator[TestClient]:
    app = create_app()

    def _db() -> Iterator[Session]:
        with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_clock] = lambda: clock
    yield TestClient(app)


# ----------------------------------------------------------------- helpers
class Api:
    """Thin helper that plays the learner through the real HTTP API."""

    def __init__(self, client: TestClient, db: Session):
        self.c, self.db = client, db
        self._n = 0

    def me(self) -> dict:
        return self.c.get("/api/me").json()

    def start(self, lesson_id: int, kind: str = "lesson") -> dict:
        r = self.c.post(f"/api/lessons/{lesson_id}/attempts", json={"kind": kind})
        assert r.status_code == 200, r.text
        return r.json()

    def key(self, exercise_id: int) -> Exercise:
        self.db.expire_all()
        return self.db.get(Exercise, exercise_id)

    def correct_answer(self, exercise: Exercise) -> dict:
        a = exercise.answer
        return {
            "multiple_choice": lambda: {"option_id": a["option_id"]},
            "translate": lambda: {"tokens": a["accepted"][0]},
            "match_pairs": lambda: {"pairs": [{"left_id": l, "right_id": r} for l, r in a["pairs"].items()]},
            "fill_blank": lambda: {"text": a["accepted"][0]},
            "type_answer": lambda: {"text": a["accepted"][0]},
        }[exercise.type]()

    def wrong_answer(self, exercise: Exercise) -> dict:
        return {
            "multiple_choice": {"option_id": "zz"},
            "translate": {"tokens": ["nope"]},
            "match_pairs": {"pairs": [{"left_id": "l0", "right_id": "r9"}]},
            "fill_blank": {"text": "zzz"},
            "type_answer": {"text": "zzz"},
        }[exercise.type]

    def answer(self, attempt_id: int, exercise_id: int, answer: dict, request_id: str | None = None):
        self._n += 1
        return self.c.post(
            f"/api/exercises/{exercise_id}/answer",
            json={"attempt_id": attempt_id, "request_id": request_id or f"req-{self._n:06d}", "answer": answer},
        )

    def solve_all(self, attempt: dict) -> None:
        for ex in attempt["exercises"]:
            r = self.answer(attempt["attempt_id"], ex["id"], self.correct_answer(self.key(ex["id"])))
            assert r.status_code == 200 and r.json()["correct"], r.text

    def complete(self, lesson_id: int, attempt_id: int):
        return self.c.post(f"/api/lessons/{lesson_id}/complete", json={"attempt_id": attempt_id})


@pytest.fixture
def api(client, db) -> Api:
    return Api(client, db)


def lesson_id(db: Session, skill_title: str, position: int = 1) -> int:
    skill = db.query(Skill).filter_by(title=skill_title).one()
    return db.query(Lesson).filter_by(skill_id=skill.id, position=position).one().id

"""Parallel duplicate requests against a real file-backed SQLite database (separate connections)."""
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.core.clock import FixedClock, get_clock
from app.core.config import Settings, get_settings
from app.db.base import Base
from app.db.session import get_db, make_engine
from app.main import create_app
from app.models import Exercise, Lesson, Skill
from app.seed.seed import seed_database
from tests.conftest import START

WORKERS = 8


@pytest.fixture
def parallel_app(tmp_path):
    settings = Settings(database_url=f"sqlite:///{tmp_path / 'parallel.db'}", auto_seed=False)
    engine = make_engine(settings.database_url)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    clock = FixedClock(START)
    with factory() as db:
        seed_database(db, clock.now(), settings)

    app = create_app()

    def _db():
        with factory() as session:
            yield session

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_clock] = lambda: clock
    yield app, factory
    engine.dispose()


def _solve_lesson(client: TestClient, factory) -> tuple[int, dict]:
    with factory() as db:
        skill = db.scalar(select(Skill).where(Skill.title == "Introductions"))
        lesson_id = db.scalar(select(Lesson.id).where(Lesson.skill_id == skill.id, Lesson.position == 1))
        keys = {e.id: e for e in db.scalars(select(Exercise).where(Exercise.lesson_id == lesson_id))}
    attempt = client.post(f"/api/lessons/{lesson_id}/attempts", json={}).json()
    for i, ex in enumerate(attempt["exercises"]):
        a = keys[ex["id"]].answer
        answer = {
            "multiple_choice": {"option_id": a.get("option_id")},
            "translate": {"tokens": (a.get("accepted") or [[]])[0]},
            "match_pairs": {"pairs": [{"left_id": k, "right_id": v} for k, v in a.get("pairs", {}).items()]},
            "fill_blank": {"text": (a.get("accepted") or [""])[0]},
            "type_answer": {"text": (a.get("accepted") or [""])[0]},
        }[ex["type"]]
        r = client.post(
            f"/api/exercises/{ex['id']}/answer",
            json={"attempt_id": attempt["attempt_id"], "request_id": f"par-{i:04d}-xx", "answer": answer},
        )
        assert r.json()["correct"], r.text
    return lesson_id, attempt


def test_parallel_duplicate_completions_award_xp_once(parallel_app):
    app, factory = parallel_app
    client = TestClient(app)
    lesson_id, attempt = _solve_lesson(client, factory)
    xp_before = client.get("/api/me").json()["xp_total"]

    def complete(_: int):
        return TestClient(app).post(f"/api/lessons/{lesson_id}/complete", json={"attempt_id": attempt["attempt_id"]})

    with ThreadPoolExecutor(WORKERS) as pool:
        responses = list(pool.map(complete, range(WORKERS)))

    assert [r.status_code for r in responses] == [200] * WORKERS, [r.text for r in responses if r.status_code != 200]
    assert sum(not r.json()["already_completed"] for r in responses) == 1  # exactly one winner
    me = client.get("/api/me").json()
    assert me["xp_total"] == xp_before + 10  # completion bonus applied once
    assert me["daily_xp"] == 12 + 10 and me["current_streak"] == 5
    assert client.get("/api/me/stats").json()["lessons_completed"] == 3


def test_parallel_identical_submissions_cost_one_heart(parallel_app):
    app, factory = parallel_app
    client = TestClient(app)
    with factory() as db:
        lesson_id = db.scalar(select(Lesson.id).join(Skill).where(Skill.title == "Introductions", Lesson.position == 1))
    attempt = client.post(f"/api/lessons/{lesson_id}/attempts", json={}).json()
    first = attempt["exercises"][0]
    body = {"attempt_id": attempt["attempt_id"], "request_id": "same-key-0001", "answer": {"option_id": "zz"}}

    def submit(_: int):
        return TestClient(app).post(f"/api/exercises/{first['id']}/answer", json=body)

    with ThreadPoolExecutor(WORKERS) as pool:
        responses = list(pool.map(submit, range(WORKERS)))

    assert [r.status_code for r in responses] == [200] * WORKERS, [r.text for r in responses if r.status_code != 200]
    assert client.get("/api/me").json()["hearts"] == 4

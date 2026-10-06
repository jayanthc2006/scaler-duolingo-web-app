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

WORKERS = 16


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


def _intro_attempt(client, factory):
    with factory() as db:
        lesson_id = db.scalar(select(Lesson.id).join(Skill).where(Skill.title == "Introductions", Lesson.position == 1))
    return lesson_id, client.post(f"/api/lessons/{lesson_id}/attempts", json={}).json()


def test_parallel_wrong_answers_cannot_dodge_heart_loss(parallel_app):
    """Distinct request ids are distinct mistakes: N parallel wrong answers must cost N hearts (max 5)."""
    app, factory = parallel_app
    client = TestClient(app)
    _, attempt = _intro_attempt(client, factory)
    ex = attempt["exercises"][0]

    def wrong(i: int):
        body = {"attempt_id": attempt["attempt_id"], "request_id": f"wrong-{i:04d}-xx", "answer": {"option_id": "zz"}}
        return TestClient(app).post(f"/api/exercises/{ex['id']}/answer", json=body)

    with ThreadPoolExecutor(WORKERS) as pool:
        responses = list(pool.map(wrong, range(WORKERS)))

    assert all(r.status_code in (200, 409) for r in responses), [r.text for r in responses if r.status_code >= 500]
    assert sum(r.status_code == 200 and r.json()["heart_lost"] for r in responses) == 5
    assert client.get("/api/me").json()["hearts"] == 0  # exactly 5 lost, never negative, none dodged


def test_parallel_correct_answers_on_different_exercises_all_count(parallel_app):
    app, factory = parallel_app
    client = TestClient(app)
    lesson_id, attempt = _intro_attempt(client, factory)
    with factory() as db:
        keys = {e.id: e for e in db.scalars(select(Exercise).where(Exercise.lesson_id == lesson_id))}
    xp_before = client.get("/api/me").json()["xp_total"]

    def solve(ex: dict):
        a = keys[ex["id"]].answer
        answer = {
            "multiple_choice": {"option_id": a.get("option_id")},
            "translate": {"tokens": (a.get("accepted") or [[]])[0]},
            "match_pairs": {"pairs": [{"left_id": k, "right_id": v} for k, v in a.get("pairs", {}).items()]},
            "fill_blank": {"text": (a.get("accepted") or [""])[0]},
            "type_answer": {"text": (a.get("accepted") or [""])[0]},
        }[ex["type"]]
        body = {"attempt_id": attempt["attempt_id"], "request_id": f"par-{ex['id']:04d}-yy", "answer": answer}
        return TestClient(app).post(f"/api/exercises/{ex['id']}/answer", json=body)

    with ThreadPoolExecutor(6) as pool:
        responses = list(pool.map(solve, attempt["exercises"]))

    assert [r.status_code for r in responses] == [200] * 6, [r.text for r in responses if r.status_code != 200]
    me = client.get("/api/me").json()
    assert me["xp_total"] == xp_before + 12 and me["daily_xp"] == 12  # no lost updates


def test_parallel_refills_charge_gems_once(parallel_app):
    app, factory = parallel_app
    from app.models import UserStats

    with factory() as db:
        db.query(UserStats).filter_by(user_id=1).update({"hearts": 0})
        db.commit()
    gems_before = TestClient(app).get("/api/me").json()["gems"]

    def refill(_: int):
        return TestClient(app).post("/api/hearts/refill")

    with ThreadPoolExecutor(WORKERS) as pool:
        responses = list(pool.map(refill, range(WORKERS)))

    assert all(r.status_code in (200, 409) for r in responses), [r.text for r in responses if r.status_code >= 500]
    assert sum(r.status_code == 200 for r in responses) == 1
    me = TestClient(app).get("/api/me").json()
    assert me["hearts"] == 5 and me["gems"] == gems_before - 100


def test_parallel_identical_pair_attempts_cost_one_heart(parallel_app):
    """The same wrong pair attempt (same request id) sent 16 times at once is one mistake, not 16."""
    app, factory = parallel_app
    client = TestClient(app)
    _, attempt = _intro_attempt(client, factory)
    pairs_ex = next(e for e in attempt["exercises"] if e["type"] == "match_pairs")
    body = {"attempt_id": attempt["attempt_id"], "request_id": "same-pair-0001", "left_id": "l0", "right_id": "r9"}

    def check(_: int):
        return TestClient(app).post(f"/api/exercises/{pairs_ex['id']}/check-pair", json=body)

    with ThreadPoolExecutor(WORKERS) as pool:
        responses = list(pool.map(check, range(WORKERS)))

    assert [r.status_code for r in responses] == [200] * WORKERS, [r.text for r in responses if r.status_code != 200]
    assert all(r.json()["match"] is False and r.json()["heart_lost"] is True for r in responses)
    assert client.get("/api/me").json()["hearts"] == 4


def _legendary(client):
    r = client.post("/api/legendary/start")
    assert r.status_code == 200, r.text
    return r.json()


def test_parallel_duplicate_wrong_legendary_answers_cost_one_penalty(parallel_app):
    app, _ = parallel_app
    client = TestClient(app)
    attempt = _legendary(client)
    ex = attempt["exercises"][0]
    body = {"attempt_id": attempt["attempt_id"], "request_id": "same-wrong-0001", "answer": {"option_id": "zz"}}

    def submit(_: int):
        return TestClient(app).post(f"/api/exercises/{ex['id']}/answer", json=body)

    with ThreadPoolExecutor(WORKERS) as pool:
        responses = list(pool.map(submit, range(WORKERS)))

    assert [r.status_code for r in responses] == [200] * WORKERS, [r.text for r in responses if r.status_code != 200]
    assert {r.json()["seconds_left"] for r in responses} == {55}  # one 5 s penalty, however many copies arrived
    assert _legendary(client)["seconds_left"] == 55


def test_parallel_distinct_wrong_legendary_answers_each_cost_a_penalty(parallel_app):
    app, _ = parallel_app
    client = TestClient(app)
    attempt = _legendary(client)
    ex = attempt["exercises"][0]

    def wrong(i: int):
        body = {"attempt_id": attempt["attempt_id"], "request_id": f"wrong-{i:04d}-xx", "answer": {"option_id": "zz"}}
        return TestClient(app).post(f"/api/exercises/{ex['id']}/answer", json=body)

    with ThreadPoolExecutor(4) as pool:
        responses = list(pool.map(wrong, range(4)))

    assert all(r.status_code == 200 for r in responses)
    assert _legendary(client)["seconds_left"] == 60 - 4 * 5  # no lost update: four distinct mistakes, four penalties


def test_parallel_end_requests_are_idempotent_and_starts_never_reuse_the_ended_attempt(parallel_app):
    app, factory = parallel_app
    client = TestClient(app)
    old = _legendary(client)

    def end(_: int):
        return TestClient(app).post(f"/api/legendary/{old['attempt_id']}/end")

    with ThreadPoolExecutor(WORKERS) as pool:
        ends = list(pool.map(end, range(WORKERS)))
    assert [r.status_code for r in ends] == [200] * WORKERS
    assert {r.json()["status"] for r in ends} == {"abandoned"}

    def start(_: int):
        return TestClient(app).post("/api/legendary/start")

    with ThreadPoolExecutor(WORKERS) as pool:
        starts = list(pool.map(start, range(WORKERS)))
    ids = {r.json()["attempt_id"] for r in starts}
    assert all(r.status_code == 200 for r in starts) and len(ids) == 1 and old["attempt_id"] not in ids  # one NEW run
    with factory() as db:
        from app.models import LessonAttempt

        rows = db.scalars(select(LessonAttempt).where(LessonAttempt.kind == "legendary")).all()
        assert sorted(r.status for r in rows) == ["abandoned", "in_progress"]


def test_end_racing_start_leaves_exactly_one_consistent_state(parallel_app):
    app, factory = parallel_app
    client = TestClient(app)
    old = _legendary(client)

    def act(i: int):
        c = TestClient(app)
        return c.post(f"/api/legendary/{old['attempt_id']}/end") if i % 2 == 0 else c.post("/api/legendary/start")

    with ThreadPoolExecutor(WORKERS) as pool:
        responses = list(pool.map(act, range(WORKERS)))
    assert all(r.status_code == 200 for r in responses), [r.text for r in responses if r.status_code != 200]
    with factory() as db:
        from app.models import LessonAttempt

        rows = db.scalars(select(LessonAttempt).where(LessonAttempt.kind == "legendary")).all()
        assert [r.status for r in rows if r.id == old["attempt_id"]] == ["abandoned"]  # terminal, whatever the order
        assert sum(r.status == "in_progress" for r in rows) <= 1

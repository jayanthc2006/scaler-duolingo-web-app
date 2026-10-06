"""Break-tests: hostile or malformed input must yield clean 4xx responses and never change state."""
from datetime import datetime

import pytest
from sqlalchemy import select

from app.models import Exercise, LessonAttempt, User
from tests.conftest import lesson_id

HUGE = 2**70  # larger than SQLite's 64-bit integers


# ------------------------------------------------------------------ ownership
def _foreign_attempt(db, lid: int) -> int:
    """An open attempt that belongs to a different learner."""
    rival = db.scalar(select(User).where(User.username == "maya"))
    attempt = LessonAttempt(user_id=rival.id, lesson_id=lid, kind="lesson", started_at=datetime(2026, 3, 10))
    db.add(attempt)
    db.commit()
    return attempt.id


def test_another_learners_attempt_cannot_be_used(api, db):
    lid = lesson_id(db, "Introductions", 1)
    foreign = _foreign_attempt(db, lid)
    ex = db.scalar(select(Exercise).where(Exercise.lesson_id == lid))
    r = api.answer(foreign, ex.id, api.correct_answer(ex))
    assert r.status_code == 404 and r.json()["error"]["code"] == "attempt_not_found"
    r = api.complete(lid, foreign)
    assert r.status_code == 404
    assert api.me()["xp_total"] == 124


def test_completing_a_lesson_you_never_started_is_rejected(api, db):
    lid = lesson_id(db, "Introductions", 1)
    assert api.complete(lid, 999_999).status_code == 404
    locked = lesson_id(db, "Everyday Words", 1)
    assert api.complete(locked, 1).status_code == 404  # attempt 1 (seeded, other lesson) does not match


def test_complete_with_zero_answers_is_rejected_and_changes_nothing(api, db):
    lid = lesson_id(db, "Introductions", 1)
    attempt = api.start(lid)
    r = api.complete(lid, attempt["attempt_id"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "lesson_incomplete"
    me = api.me()
    assert (me["xp_total"], me["gems"], me["current_streak"], me["daily_xp"]) == (124, 450, 4, 0)
    skills = api.c.get("/api/skills").json()
    assert skills[1]["lessons_completed"] == 0


# ------------------------------------------------------------------ malformed ids and payloads
@pytest.mark.parametrize("path", [
    f"/api/lessons/{HUGE}", f"/api/lessons/{HUGE}/exercises", f"/api/skills/{HUGE}",
    f"/api/courses/{HUGE}/path", "/api/lessons/-5", "/api/skills/0", "/api/lessons/abc",
])
def test_get_with_bad_ids_gives_4xx(client, path):
    r = client.get(path)
    assert 400 <= r.status_code < 500, (path, r.status_code, r.text)
    assert "error" in r.json()


@pytest.mark.parametrize("method,path,body", [
    ("post", f"/api/lessons/{HUGE}/attempts", {}),
    ("post", f"/api/lessons/{HUGE}/complete", {"attempt_id": 1}),
    ("post", "/api/lessons/3/complete", {"attempt_id": HUGE}),
    ("post", f"/api/exercises/{HUGE}/answer", {"attempt_id": 1, "request_id": "abcdefgh", "answer": {"text": "x"}}),
    ("post", "/api/exercises/15/answer", {"attempt_id": HUGE, "request_id": "abcdefgh", "answer": {"text": "x"}}),
    ("post", f"/api/exercises/{HUGE}/check-pair", {"left_id": "l0", "right_id": "r0"}),
    ("post", "/api/lessons/3/attempts", {"kind": "cheat"}),
    ("post", "/api/lessons/3/complete", {}),
    ("post", "/api/exercises/15/answer", {"attempt_id": 1, "request_id": "x", "answer": {}}),
    ("post", "/api/exercises/15/answer", {"attempt_id": "one", "request_id": "abcdefgh", "answer": {}}),
    ("post", "/api/exercises/15/answer", {"attempt_id": 1, "request_id": "abcdefgh", "answer": {"pairs": "nope"}}),
    ("post", "/api/exercises/15/answer", {"attempt_id": 1, "request_id": "abcdefgh", "answer": {"text": "x" * 5000}}),
    ("patch", "/api/me/daily-goal", {"daily_goal_xp": -10}),
    ("patch", "/api/me/daily-goal", {"daily_goal_xp": HUGE}),
    ("patch", "/api/me/daily-goal", {"daily_goal_xp": "lots"}),
    ("patch", "/api/me/daily-goal", {}),
])
def test_malformed_requests_give_4xx_never_500(client, method, path, body):
    r = getattr(client, method)(path, json=body)
    assert 400 <= r.status_code < 500, (path, body, r.status_code, r.text)
    assert "error" in r.json()


def test_non_json_body_is_a_clean_422(client):
    r = client.post("/api/lessons/3/attempts", content=b"not json", headers={"content-type": "application/json"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"


# ------------------------------------------------------------------ nothing client-controlled
@pytest.mark.parametrize("method,path", [
    ("post", "/api/activity"), ("post", "/api/me/xp"), ("patch", "/api/me"), ("put", "/api/me/stats"),
    ("post", "/api/me/streak"), ("post", "/api/hearts"), ("patch", "/api/skills/2"),
])
def test_there_is_no_endpoint_to_set_game_state_directly(client, method, path):
    assert getattr(client, method)(path, json={"xp": 9999, "hearts": 5, "streak": 99}).status_code in (404, 405)


def test_forged_extra_fields_are_ignored_everywhere(api, db):
    lid = lesson_id(db, "Introductions", 1)
    forged = {"kind": "lesson", "xp": 500, "hearts": 99, "status": "completed"}
    r = api.c.post(f"/api/lessons/{lid}/attempts", json=forged)
    attempt = r.json()
    ex = attempt["exercises"][0]
    api.c.post(f"/api/exercises/{ex['id']}/answer", json={
        "attempt_id": attempt["attempt_id"], "request_id": "forge-0001", "answer": {"option_id": "zz"},
        "correct": True, "xp_awarded": 500, "hearts": 5, "learner": {"xp_total": 99999},
    })
    r = api.c.post(f"/api/lessons/{lid}/complete", json={"attempt_id": attempt["attempt_id"], "xp": 500, "force": True})
    assert r.status_code == 409
    me = api.me()
    assert me["xp_total"] == 124 and me["hearts"] == 4 and me["gems"] == 450


# ------------------------------------------------------------------ practice is not a reward farm
def test_practice_awards_no_xp_gems_streak_or_progress_even_when_hearts_are_full(api, db):
    first = api.c.post("/api/hearts/practice").json()
    assert first["kind"] == "practice" and first["learner"]["hearts"] == 5
    api.solve_all(first)
    done = api.complete(first["lesson_id"], first["attempt_id"]).json()
    me = api.me()
    assert done["xp_total_gained"] == 0 and done["gems_awarded"] == 0 and done["hearts_gained"] == 0
    assert (me["xp_total"], me["gems"], me["hearts"], me["current_streak"], me["daily_xp"]) == (124, 450, 5, 4, 0)
    assert api.c.get("/api/me/stats").json()["lessons_completed"] == 2  # practice is not a lesson completion


def test_failed_attempt_does_not_change_progression_or_completion_state(api, db):
    lid = lesson_id(db, "Introductions", 1)
    attempt = api.start(lid)
    ex = attempt["exercises"][0]
    for _ in range(5):
        api.answer(attempt["attempt_id"], ex["id"], api.wrong_answer(api.key(ex["id"])))
    assert api.me()["hearts"] == 0
    skills = api.c.get("/api/skills").json()
    assert (skills[1]["status"], skills[1]["lessons_completed"]) == ("available", 0)
    assert skills[2]["status"] == "locked"
    assert api.complete(lid, attempt["attempt_id"]).status_code == 409


# ------------------------------------------------------------------ progression, resume
def test_finishing_a_lesson_unlocks_exactly_the_next_one(api, db):
    l1 = lesson_id(db, "Introductions", 1)
    l2 = lesson_id(db, "Introductions", 2)
    l3 = lesson_id(db, "Everyday Words", 1)
    status = lambda lid: api.c.get(f"/api/lessons/{lid}").json()["status"]  # noqa: E731
    assert (status(l1), status(l2), status(l3)) == ("available", "locked", "locked")
    api.solve_all(api.start(l1))
    attempt = api.start(l1)
    api.complete(l1, attempt["attempt_id"])
    assert (status(l1), status(l2), status(l3)) == ("completed", "available", "locked")


def test_resume_after_refresh_keeps_hearts_xp_and_solved_state(api, db):
    lid = lesson_id(db, "Introductions", 1)
    first = api.start(lid)
    e0, e1 = first["exercises"][:2]
    api.answer(first["attempt_id"], e0["id"], api.wrong_answer(api.key(e0["id"])))
    api.answer(first["attempt_id"], e1["id"], api.correct_answer(api.key(e1["id"])))
    again = api.start(lid)  # a page refresh calls start again
    assert again["attempt_id"] == first["attempt_id"]
    assert again["solved_exercise_ids"] == [e1["id"]]
    assert again["learner"]["hearts"] == 4 and again["learner"]["xp_total"] == 126

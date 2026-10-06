"""Legendary (timed) challenge: reuses the lesson engine, adds a server-enforced clock and a once-per-lesson reward."""
from sqlalchemy import func, select

from app.models import LessonAttempt, UserSkillProgress
from tests.conftest import lesson_id


def _start(api, expect: int = 200):
    r = api.c.post("/api/legendary/start")
    assert r.status_code == expect, r.text
    return r.json()


def _win(api, attempt: dict):
    api.solve_all(attempt)
    return api.complete(attempt["lesson_id"], attempt["attempt_id"])


def _row(db, attempt_id: int) -> LessonAttempt:
    db.expire_all()
    return db.get(LessonAttempt, attempt_id)


def test_status_reports_availability_and_rewards(api, settings):
    s = api.c.get("/api/legendary").json()
    assert s == {
        "available": True, "remaining": 2, "conquered": 0,  # Alex has finished the two Greetings lessons
        "time_limit_seconds": settings.legendary_seconds,
        "reward_xp": settings.legendary_xp, "reward_gems": settings.legendary_gems,
    }


def test_start_returns_a_timed_attempt_without_answer_keys(api, db, settings):
    a = _start(api)
    assert a["kind"] == "legendary"
    assert a["lesson_id"] == lesson_id(db, "Greetings", 1)  # first completed lesson in path order
    assert a["time_limit_seconds"] == settings.legendary_seconds == a["seconds_left"]
    assert len(a["exercises"]) == 6
    assert all("answer" not in e and "explanation" not in e for e in a["exercises"])


def test_generic_start_endpoint_cannot_create_a_legendary_attempt(api, db):
    r = api.c.post(f"/api/lessons/{lesson_id(db, 'Greetings', 1)}/attempts", json={"kind": "legendary"})
    assert r.status_code == 422


def test_winning_pays_xp_and_gems_once_and_feeds_streak_and_league(api, db, settings):
    before = api.me()
    lb_before = api.c.get("/api/leaderboard").json()["current_user"]["xp"]
    attempt = _start(api)
    done = _win(api, attempt)
    assert done.status_code == 200
    body = done.json()
    assert body["kind"] == "legendary" and body["already_completed"] is False
    assert body["xp_total_gained"] == settings.legendary_xp and body["xp_from_answers"] == 0
    assert body["gems_awarded"] == settings.legendary_gems
    assert [a["code"] for a in body["new_achievements"]] == ["legendary_1"]
    after = api.me()
    assert after["xp_total"] == before["xp_total"] + settings.legendary_xp
    assert after["gems"] == before["gems"] + settings.legendary_gems
    assert after["daily_xp"] == before["daily_xp"] + settings.legendary_xp
    lb_after = api.c.get("/api/leaderboard").json()["current_user"]["xp"]
    assert lb_after == lb_before + settings.legendary_xp  # derived from daily_activity, not stored


def test_replaying_the_completion_is_idempotent(api):
    attempt = _start(api)
    first = _win(api, attempt)
    xp = api.me()["xp_total"]
    again = api.complete(attempt["lesson_id"], attempt["attempt_id"])
    assert again.status_code == 200 and again.json()["already_completed"] is True
    assert again.json()["new_achievements"] == []
    assert api.me()["xp_total"] == xp
    assert first.json()["xp_total_gained"] == again.json()["xp_total_gained"]


def test_each_lesson_pays_only_once_and_the_next_start_moves_on(api, db):
    first = _start(api)
    _win(api, first)
    second = _start(api)
    assert second["lesson_id"] == lesson_id(db, "Greetings", 2) != first["lesson_id"]
    _win(api, second)
    assert api.c.get("/api/legendary").json()["available"] is False
    err = _start(api, expect=409)
    assert err["error"]["code"] == "legendary_unavailable"
    won = select(func.count()).select_from(LessonAttempt).where(
        LessonAttempt.kind == "legendary", LessonAttempt.status == "completed"
    )
    count = db.scalar(won)
    assert count == 2


def test_wrong_answers_cost_no_hearts_and_no_xp(api):
    attempt = _start(api)
    hearts, xp = api.me()["hearts"], api.me()["xp_total"]
    ex = attempt["exercises"][0]
    r = api.answer(attempt["attempt_id"], ex["id"], api.wrong_answer(api.key(ex["id"])))
    assert r.status_code == 200 and r.json()["correct"] is False and r.json()["heart_lost"] is False
    assert (api.me()["hearts"], api.me()["xp_total"]) == (hearts, xp)


def test_incomplete_run_cannot_claim_the_reward(api):
    attempt = _start(api)
    r = api.complete(attempt["lesson_id"], attempt["attempt_id"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "lesson_incomplete"


def test_late_win_is_rejected_and_pays_nothing(api, db, clock, settings):
    attempt = _start(api)
    api.solve_all(attempt)
    xp = api.me()["xp_total"]
    clock.advance(seconds=settings.legendary_seconds + settings.legendary_grace_seconds + 1)
    r = api.complete(attempt["lesson_id"], attempt["attempt_id"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "legendary_expired"
    assert api.me()["xp_total"] == xp
    assert _row(db, attempt["attempt_id"]).status == "failed"
    # and it stays rejected: a failed attempt can never be completed later
    again = api.complete(attempt["lesson_id"], attempt["attempt_id"])
    assert again.status_code == 409 and again.json()["error"]["code"] == "attempt_closed"
    assert api.me()["xp_total"] == xp


def test_win_inside_the_grace_window_is_accepted(api, clock, settings):
    attempt = _start(api)
    api.solve_all(attempt)
    clock.advance(seconds=settings.legendary_seconds + settings.legendary_grace_seconds - 1)
    assert api.complete(attempt["lesson_id"], attempt["attempt_id"]).status_code == 200


def test_retry_after_time_is_up_gets_a_fresh_clock(api, db, clock, settings):
    old = _start(api)
    clock.advance(seconds=settings.legendary_seconds + 5)
    new = _start(api)
    assert new["attempt_id"] != old["attempt_id"] and new["lesson_id"] == old["lesson_id"]
    assert new["seconds_left"] == settings.legendary_seconds
    assert _row(db, old["attempt_id"]).status == "failed"
    assert _win(api, new).status_code == 200


def test_refresh_resumes_the_running_attempt_with_the_remaining_time(api, clock, settings):
    attempt = _start(api)
    first = attempt["exercises"][0]
    api.answer(attempt["attempt_id"], first["id"], api.correct_answer(api.key(first["id"])))
    clock.advance(seconds=10)
    resumed = _start(api)
    assert resumed["attempt_id"] == attempt["attempt_id"]
    assert resumed["seconds_left"] == settings.legendary_seconds - 10
    assert resumed["solved_exercise_ids"] == [first["id"]]


def test_completed_attempt_replay_cannot_be_used_to_farm_after_expiry(api, clock, settings):
    attempt = _start(api)
    _win(api, attempt)
    xp = api.me()["xp_total"]
    clock.advance(seconds=3600)
    assert api.complete(attempt["lesson_id"], attempt["attempt_id"]).json()["already_completed"] is True
    assert api.me()["xp_total"] == xp


def test_normal_progress_is_untouched_by_legendary_runs(api, db):
    skills_before = db.scalar(select(func.count()).select_from(UserSkillProgress))
    lessons_before = api.c.get("/api/me/stats").json()["lessons_completed"]
    attempt = _start(api)
    _win(api, attempt)
    stats = api.c.get("/api/me/stats").json()
    assert stats["lessons_completed"] == lessons_before  # legendary is not a lesson completion
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(UserSkillProgress)) == skills_before
    # a real, not-yet-completed lesson still behaves exactly as before
    nxt = api.start(lesson_id(db, "Introductions", 1))
    assert nxt["kind"] == "lesson" and nxt["time_limit_seconds"] is None and nxt["seconds_left"] is None
    # and an already-completed lesson still refuses a normal attempt
    r = api.c.post(f"/api/lessons/{attempt['lesson_id']}/attempts", json={"kind": "lesson"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "lesson_already_completed"


def test_legendary_does_not_need_hearts(api, db):
    from app.models import UserStats

    stats = db.scalar(select(UserStats))
    stats.hearts = 0
    db.commit()
    attempt = _start(api)  # a normal lesson would be refused with out_of_hearts
    assert _win(api, attempt).status_code == 200

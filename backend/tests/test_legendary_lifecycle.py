"""Legendary: fixed wrong-answer time penalty (server-derived) and an explicit, terminal End Session."""
import itertools

from sqlalchemy import func, select

from app.models import LessonAttempt, UserAchievement, UserSkillProgress
from tests.conftest import lesson_id

_ids = itertools.count(1)


def _start(api):
    r = api.c.post("/api/legendary/start")
    assert r.status_code == 200, r.text
    return r.json()


def _wrong(api, attempt, index=0, request_id=None, **extra):
    ex = attempt["exercises"][index]
    return api.c.post(
        f"/api/exercises/{ex['id']}/answer",
        json={
            "attempt_id": attempt["attempt_id"],
            "request_id": request_id or f"wrong-{next(_ids):06d}",
            "answer": api.wrong_answer(api.key(ex["id"])),
            **extra,
        },
    )


def _correct(api, attempt, index=0):
    ex = attempt["exercises"][index]
    return api.answer(attempt["attempt_id"], ex["id"], api.correct_answer(api.key(ex["id"])))


def _end(api, attempt_id):
    return api.c.post(f"/api/legendary/{attempt_id}/end")


def _row(db, attempt_id):
    db.expire_all()
    return db.get(LessonAttempt, attempt_id)


def _stats(api, db):
    db.expire_all()
    me = api.me()
    return (
        me["xp_total"], me["gems"], me["hearts"],
        db.scalar(select(func.count()).select_from(UserAchievement)),
        db.scalar(select(func.count()).select_from(UserSkillProgress)),
        db.scalar(select(func.count()).select_from(LessonAttempt).where(LessonAttempt.kind == "lesson")),
    )


# ---------------------------------------------------------------- time penalty
def test_correct_answer_costs_no_time(api, settings):
    attempt = _start(api)
    r = _correct(api, attempt)
    assert r.status_code == 200 and r.json()["correct"] is True
    assert r.json()["seconds_left"] == settings.legendary_seconds


def test_wrong_answer_costs_exactly_the_configured_penalty_and_no_heart(api, settings):
    attempt = _start(api)
    hearts = api.me()["hearts"]
    r = _wrong(api, attempt)
    body = r.json()
    assert r.status_code == 200 and body["correct"] is False and body["heart_lost"] is False
    assert body["seconds_left"] == settings.legendary_seconds - settings.legendary_wrong_answer_penalty_seconds
    assert api.me()["hearts"] == hearts


def test_each_distinct_wrong_answer_costs_one_penalty_and_a_right_one_in_between_is_free(api, settings):
    attempt = _start(api)
    p, limit = settings.legendary_wrong_answer_penalty_seconds, settings.legendary_seconds
    assert _wrong(api, attempt).json()["seconds_left"] == limit - p
    assert _correct(api, attempt, 1).json()["seconds_left"] == limit - p
    assert _wrong(api, attempt).json()["seconds_left"] == limit - 2 * p


def test_wrong_answer_replay_with_the_same_request_id_is_one_penalty(api, settings):
    attempt = _start(api)
    p = settings.legendary_wrong_answer_penalty_seconds
    first = _wrong(api, attempt, request_id="same-wrong-0001").json()
    again = _wrong(api, attempt, request_id="same-wrong-0001").json()
    assert first["seconds_left"] == again["seconds_left"] == settings.legendary_seconds - p
    assert _start(api)["seconds_left"] == settings.legendary_seconds - p


def test_the_client_cannot_supply_or_dodge_the_clock(api, settings):
    attempt = _start(api)
    p = settings.legendary_wrong_answer_penalty_seconds
    cheat = {"seconds_left": 999, "deadline": "2099-01-01T00:00:00", "penalty": 0, "time_penalty_seconds": -50}
    r = _wrong(api, attempt, **cheat)
    assert r.status_code == 200 and r.json()["seconds_left"] == settings.legendary_seconds - p
    resumed = api.c.post("/api/legendary/start", json={"seconds_left": 999})
    assert resumed.json()["seconds_left"] == settings.legendary_seconds - p


def test_a_wrong_match_pair_costs_the_same_penalty(api, settings):
    attempt = _start(api)
    ex = next(e for e in attempt["exercises"] if e["type"] == "match_pairs")
    pairs = api.key(ex["id"]).answer["pairs"]
    left = next(iter(pairs))
    wrong_right = next(r for lft, r in pairs.items() if lft != left)
    body = {
        "attempt_id": attempt["attempt_id"], "request_id": "pair-time-0001", "left_id": left, "right_id": wrong_right,
    }
    r = api.c.post(f"/api/exercises/{ex['id']}/check-pair", json=body)
    assert r.json()["heart_lost"] is False
    assert r.json()["seconds_left"] == settings.legendary_seconds - settings.legendary_wrong_answer_penalty_seconds


def test_time_never_goes_negative_and_an_exhausted_clock_refuses_more_answers(api, db, settings):
    attempt = _start(api)
    p, limit = settings.legendary_wrong_answer_penalty_seconds, settings.legendary_seconds
    lefts = []
    for _ in range(-(-limit // p)):  # exactly enough wrong answers to use up the clock
        r = _wrong(api, attempt)
        assert r.status_code == 200
        lefts.append(r.json()["seconds_left"])
    assert lefts[-1] == 0 and min(lefts) >= 0
    refused = _wrong(api, attempt)
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "legendary_expired"
    assert _row(db, attempt["attempt_id"]).status == "failed"
    assert _correct(api, attempt).status_code == 409  # not even a right answer once time is gone


def test_practice_wrong_answers_stay_free_and_normal_lessons_are_ruled_by_hearts(api, db):
    practice = api.start(lesson_id(db, "Greetings", 1), "practice")
    ex = practice["exercises"][0]
    r = api.answer(practice["attempt_id"], ex["id"], api.wrong_answer(api.key(ex["id"]))).json()
    assert r["seconds_left"] is None and r["heart_lost"] is False and api.me()["hearts"] == 5

    lesson = api.start(lesson_id(db, "Introductions", 1))
    ex = lesson["exercises"][0]
    r = api.answer(lesson["attempt_id"], ex["id"], api.wrong_answer(api.key(ex["id"]))).json()
    assert r["seconds_left"] is None and r["heart_lost"] is True and api.me()["hearts"] == 4


def test_completion_counts_the_penalty_inside_the_deadline_and_after_it(api, clock, settings):
    p, limit = settings.legendary_wrong_answer_penalty_seconds, settings.legendary_seconds
    grace = settings.legendary_grace_seconds
    ok = _start(api)
    for _ in range(2):
        _wrong(api, ok)
    api.solve_all(ok)
    clock.advance(seconds=limit - 2 * p - 5)  # comfortably inside the penalty-adjusted deadline
    assert api.complete(ok["lesson_id"], ok["attempt_id"]).status_code == 200

    late = _start(api)  # the next lesson
    for _ in range(5):
        _wrong(api, late)
    api.solve_all(late)
    clock.advance(seconds=limit + grace - 5 * p + 1)  # on the clock alone it would still be in time
    r = api.complete(late["lesson_id"], late["attempt_id"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "legendary_expired"


def test_refresh_keeps_the_same_attempt_and_the_accumulated_penalty(api, clock, settings):
    attempt = _start(api)
    _wrong(api, attempt)
    clock.advance(seconds=10)
    resumed = _start(api)
    assert resumed["attempt_id"] == attempt["attempt_id"]
    assert resumed["seconds_left"] == settings.legendary_seconds - 10 - settings.legendary_wrong_answer_penalty_seconds


# ---------------------------------------------------------------- explicit End Session
def test_end_session_abandons_the_attempt_without_any_reward_or_progress(api, db):
    attempt = _start(api)
    api.solve_all(attempt)  # even a fully solved run pays nothing once ended
    before = _stats(api, db)
    r = _end(api, attempt["attempt_id"])
    assert r.status_code == 200 and r.json() == {"attempt_id": attempt["attempt_id"], "status": "abandoned"}
    assert _row(db, attempt["attempt_id"]).status == "abandoned"
    assert _stats(api, db) == before  # no XP, gems, hearts, achievements, lesson or skill progress


def test_start_after_end_session_is_a_fresh_attempt_with_a_full_clock(api, clock, settings):
    old = _start(api)
    _wrong(api, old)
    clock.advance(seconds=40)
    assert _end(api, old["attempt_id"]).status_code == 200
    new = _start(api)
    assert new["attempt_id"] != old["attempt_id"]
    assert new["seconds_left"] == settings.legendary_seconds  # no leftover time, no leftover penalty
    assert new["solved_exercise_ids"] == []
    clock.advance(seconds=7)
    again = _start(api)  # a refresh of the NEW run resumes it
    assert again["attempt_id"] == new["attempt_id"] and again["seconds_left"] == settings.legendary_seconds - 7


def test_an_ended_attempt_stays_terminal(api, db):
    attempt = _start(api)
    ex = attempt["exercises"][0]
    assert _end(api, attempt["attempt_id"]).status_code == 200
    stale_answer = api.answer(attempt["attempt_id"], ex["id"], api.correct_answer(api.key(ex["id"])))
    assert stale_answer.status_code == 409 and stale_answer.json()["error"]["code"] == "attempt_closed"
    stale_done = api.complete(attempt["lesson_id"], attempt["attempt_id"])
    assert stale_done.status_code == 409 and stale_done.json()["error"]["code"] == "attempt_closed"
    assert _end(api, attempt["attempt_id"]).json()["status"] == "abandoned"  # ending again reopens nothing
    assert _row(db, attempt["attempt_id"]).status == "abandoned"
    assert _start(api)["attempt_id"] != attempt["attempt_id"]


def test_ending_is_idempotent_and_never_touches_other_terminal_states(api, db, clock, settings):
    a = _start(api)
    assert [_end(api, a["attempt_id"]).json()["status"] for _ in range(3)] == ["abandoned"] * 3

    won = _start(api)
    api.solve_all(won)
    assert api.complete(won["lesson_id"], won["attempt_id"]).status_code == 200
    assert _end(api, won["attempt_id"]).json()["status"] == "completed"  # a win cannot be undone by ending it

    failed = _start(api)
    clock.advance(seconds=settings.legendary_seconds + 5)
    _start(api)  # the timed-out run is closed as failed and replaced
    assert _end(api, failed["attempt_id"]).json()["status"] == "failed"
    assert _row(db, won["attempt_id"]).status == "completed"


def test_end_only_works_on_your_own_legendary_attempts(api, db):
    lesson_attempt = api.start(lesson_id(db, "Introductions", 1))
    assert _end(api, lesson_attempt["attempt_id"]).status_code == 404  # not a legendary attempt
    assert _end(api, 987654).status_code == 404
    assert _row(db, lesson_attempt["attempt_id"]).status == "in_progress"  # normal lessons are untouched


def test_timeout_still_closes_the_attempt_and_try_again_is_a_new_one(api, db, clock, settings):
    old = _start(api)
    clock.advance(seconds=settings.legendary_seconds + 1)
    new = _start(api)
    assert new["attempt_id"] != old["attempt_id"] and new["seconds_left"] == settings.legendary_seconds
    assert _row(db, old["attempt_id"]).status == "failed"


def test_a_win_after_an_abandoned_run_still_pays_exactly_once(api, db, settings):
    abandoned = _start(api)
    _end(api, abandoned["attempt_id"])
    before = api.me()["xp_total"]
    fresh = _start(api)
    api.solve_all(fresh)
    first = api.complete(fresh["lesson_id"], fresh["attempt_id"])
    assert first.status_code == 200 and first.json()["xp_total_gained"] == settings.legendary_xp
    again = api.complete(fresh["lesson_id"], fresh["attempt_id"])
    assert again.json()["already_completed"] is True
    assert api.me()["xp_total"] == before + settings.legendary_xp

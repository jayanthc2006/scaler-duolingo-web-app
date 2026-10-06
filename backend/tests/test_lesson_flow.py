"""End-to-end behaviour through the HTTP API: answers, hearts, XP, completion, streaks."""
from tests.conftest import lesson_id

XP_CORRECT, XP_BONUS = 2, 10


def _play_lesson(api, lid):
    attempt = api.start(lid)
    api.solve_all(attempt)
    return attempt, api.complete(lid, attempt["attempt_id"])


# ------------------------------------------------------------------ the core journey
def test_full_learner_journey(api, client, db):
    lid = lesson_id(db, "Introductions", 1)
    before = api.me()
    attempt = api.start(lid)
    exercises = attempt["exercises"]
    assert len(exercises) == 6 and attempt["solved_exercise_ids"] == []

    # first answer is wrong: backend decides, heart is lost, correct answer is revealed
    first = exercises[0]
    r = api.answer(attempt["attempt_id"], first["id"], api.wrong_answer(api.key(first["id"]))).json()
    assert r["correct"] is False and r["heart_lost"] is True
    assert r["learner"]["hearts"] == 4 and r["xp_awarded"] == 0
    assert r["correct_answer"] == "Me llamo Ana"

    api.solve_all(attempt)  # includes the exercise we got wrong (re-queued in the UI)
    assert api.me()["hearts"] == 4
    assert api.me()["xp_total"] == before["xp_total"] + XP_CORRECT * 6

    done = api.complete(lid, attempt["attempt_id"])
    assert done.status_code == 200
    body = done.json()
    assert body["already_completed"] is False
    assert body["xp_from_answers"] == 12 and body["xp_completion_bonus"] == XP_BONUS
    assert body["xp_total_gained"] == 22 and body["mistakes"] == 1
    assert body["gems_awarded"] == 5 and body["skill_completed"] is False

    me = body["learner"]
    assert me["xp_total"] == before["xp_total"] + 22
    assert me["daily_xp"] == 22 and me["streak_active_today"] is True
    assert me["current_streak"] == 5 and me["gems"] == before["gems"] + 5

    # skill progress + unlocking
    skill = client.get(f"/api/skills/{api.c.get('/api/lessons/%d' % lid).json()['skill_id']}").json()
    assert skill["status"] == "in_progress" and skill["lessons_completed"] == 1
    assert [l["status"] for l in skill["lessons"]] == ["completed", "available"]

    # state is durable: a brand new session reads the same numbers
    assert client.get("/api/me").json()["xp_total"] == me["xp_total"]


def test_completing_second_lesson_finishes_skill_and_unlocks_next(api, client, db):
    _play_lesson(api, lesson_id(db, "Introductions", 1))
    _, done = _play_lesson(api, lesson_id(db, "Introductions", 2))
    assert done.json()["skill_completed"] is True
    skills = client.get("/api/skills").json()
    assert [s["status"] for s in skills[:4]] == ["completed", "completed", "available", "locked"]
    assert [a["code"] for a in done.json()["new_achievements"]] == []  # 4 lessons < 5


def test_fifth_lesson_unlocks_achievement_once(api, db):
    _play_lesson(api, lesson_id(db, "Introductions", 1))
    _play_lesson(api, lesson_id(db, "Introductions", 2))
    _, done = _play_lesson(api, lesson_id(db, "Everyday Words", 1))
    assert "five_lessons" in [a["code"] for a in done.json()["new_achievements"]]
    stats = api.c.get("/api/me/stats").json()
    assert stats["lessons_completed"] == 5 and stats["skills_completed"] == 2
    assert sum(a["unlocked"] for a in stats["achievements"]) == 5


# ------------------------------------------------------------------ server-side completion checks
def test_incomplete_lesson_cannot_be_completed(api, db):
    lid = lesson_id(db, "Introductions", 1)
    attempt = api.start(lid)
    assert api.complete(lid, attempt["attempt_id"]).json()["error"]["code"] == "lesson_incomplete"
    for ex in attempt["exercises"][:-1]:  # all but one
        api.answer(attempt["attempt_id"], ex["id"], api.correct_answer(api.key(ex["id"])))
    r = api.complete(lid, attempt["attempt_id"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "lesson_incomplete"
    me = api.me()
    assert me["xp_total"] == 124 + XP_CORRECT * 5  # answer XP only; no completion bonus
    assert me["current_streak"] == 5  # activity happened, but the lesson is not completed


def test_wrong_answers_do_not_count_towards_completion(api, db):
    lid = lesson_id(db, "Introductions", 1)
    attempt = api.start(lid)
    for ex in attempt["exercises"]:
        api.answer(attempt["attempt_id"], ex["id"], api.wrong_answer(api.key(ex["id"])))
    assert api.complete(lid, attempt["attempt_id"]).status_code == 409


def test_cannot_complete_with_someone_elses_or_unknown_attempt(api, db):
    lid = lesson_id(db, "Introductions", 1)
    assert api.complete(lid, 424242).status_code == 404
    other = lesson_id(db, "Introductions", 2)
    attempt = api.start(lid)
    assert api.complete(other, attempt["attempt_id"]).status_code == 404  # attempt/lesson mismatch


def test_duplicate_completion_is_idempotent(api, db):
    lid = lesson_id(db, "Introductions", 1)
    attempt, first = _play_lesson(api, lid)
    xp_after_first = api.me()["xp_total"]
    second = api.complete(lid, attempt["attempt_id"])
    third = api.complete(lid, attempt["attempt_id"])
    assert second.status_code == third.status_code == 200
    assert second.json()["already_completed"] is True
    assert second.json()["xp_total_gained"] == first.json()["xp_total_gained"]
    assert api.me()["xp_total"] == xp_after_first
    assert api.me()["gems"] == first.json()["learner"]["gems"]
    assert api.me()["daily_xp"] == 22


def test_completed_lesson_cannot_be_farmed_again(api, db):
    lid = lesson_id(db, "Introductions", 1)
    _play_lesson(api, lid)
    r = api.c.post(f"/api/lessons/{lid}/attempts", json={"kind": "lesson"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "lesson_already_completed"


# ------------------------------------------------------------------ answer protection
def test_same_request_id_replays_without_double_heart_loss(api, db):
    lid = lesson_id(db, "Introductions", 1)
    attempt = api.start(lid)
    ex = attempt["exercises"][0]
    wrong = api.wrong_answer(api.key(ex["id"]))
    a = api.answer(attempt["attempt_id"], ex["id"], wrong, request_id="same-request-1").json()
    b = api.answer(attempt["attempt_id"], ex["id"], wrong, request_id="same-request-1").json()
    assert a["learner"]["hearts"] == b["learner"]["hearts"] == 4
    assert api.me()["hearts"] == 4


def test_same_request_id_cannot_be_reused_for_another_exercise(api, db):
    attempt = api.start(lesson_id(db, "Introductions", 1))
    e1, e2 = attempt["exercises"][:2]
    api.answer(attempt["attempt_id"], e1["id"], api.correct_answer(api.key(e1["id"])), request_id="shared-id-1")
    r = api.answer(attempt["attempt_id"], e2["id"], api.correct_answer(api.key(e2["id"])), request_id="shared-id-1")
    assert r.status_code == 409 and r.json()["error"]["code"] == "request_id_reuse"


def test_solving_the_same_exercise_twice_awards_xp_once(api, db):
    attempt = api.start(lesson_id(db, "Introductions", 1))
    ex = attempt["exercises"][0]
    good = api.correct_answer(api.key(ex["id"]))
    first = api.answer(attempt["attempt_id"], ex["id"], good).json()
    second = api.answer(attempt["attempt_id"], ex["id"], good).json()
    assert first["xp_awarded"] == XP_CORRECT and not first["already_solved"]
    assert second["xp_awarded"] == 0 and second["already_solved"] is True
    assert api.me()["xp_total"] == 124 + XP_CORRECT
    # and a wrong answer after solving costs nothing
    again = api.answer(attempt["attempt_id"], ex["id"], api.wrong_answer(api.key(ex["id"]))).json()
    assert again["correct"] is True and api.me()["hearts"] == 5


def test_answer_cannot_bypass_backend_validation(api, db):
    attempt = api.start(lesson_id(db, "Introductions", 1))
    ex = attempt["exercises"][0]
    # client-supplied "correct"/xp fields are not part of the contract and are ignored
    r = api.c.post(
        f"/api/exercises/{ex['id']}/answer",
        json={"attempt_id": attempt["attempt_id"], "request_id": "cheat-0001", "correct": True,
              "xp": 999, "answer": {"option_id": "zz"}},
    )
    assert r.status_code == 200 and r.json()["correct"] is False
    assert api.me()["xp_total"] == 124


def test_malformed_answer_is_rejected_without_penalty(api, db):
    attempt = api.start(lesson_id(db, "Introductions", 1))
    ex = attempt["exercises"][0]  # multiple choice
    r = api.answer(attempt["attempt_id"], ex["id"], {"text": "hola"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_answer"
    assert api.me()["hearts"] == 5


def test_exercise_from_another_lesson_is_rejected(api, db):
    a1 = api.start(lesson_id(db, "Introductions", 1))
    other = api.c.get(f"/api/lessons/{lesson_id(db, 'Greetings', 1)}/exercises").json()[0]
    r = api.answer(a1["attempt_id"], other["id"], {"option_id": "a"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "exercise_not_in_attempt"


def test_attempt_is_resumable_after_refresh(api, db):
    lid = lesson_id(db, "Introductions", 1)
    first = api.start(lid)
    ex = first["exercises"][0]
    api.answer(first["attempt_id"], ex["id"], api.correct_answer(api.key(ex["id"])))
    again = api.start(lid)
    assert again["attempt_id"] == first["attempt_id"]
    assert again["solved_exercise_ids"] == [ex["id"]]


def test_match_pair_probe(api, db):
    attempt = api.start(lesson_id(db, "Introductions", 1))
    pairs_ex = next(e for e in attempt["exercises"] if e["type"] == "match_pairs")
    key = api.key(pairs_ex["id"]).answer["pairs"]
    left, right = next(iter(key.items()))
    url = f"/api/exercises/{pairs_ex['id']}/check-pair"
    assert api.c.post(url, json={"left_id": left, "right_id": right}).json() == {"match": True}
    assert api.c.post(url, json={"left_id": left, "right_id": "r9"}).json() == {"match": False}
    mc_ex = next(e for e in attempt["exercises"] if e["type"] == "multiple_choice")
    r = api.c.post(f"/api/exercises/{mc_ex['id']}/check-pair", json={"left_id": "a", "right_id": "b"})
    assert r.status_code == 409
    assert api.me()["hearts"] == 5  # probing has no side effects


# ------------------------------------------------------------------ hearts
def _drain_hearts(api, attempt):
    ex = attempt["exercises"][0]
    last = None
    for _ in range(5):
        last = api.answer(attempt["attempt_id"], ex["id"], api.wrong_answer(api.key(ex["id"]))).json()
    return ex, last


def test_zero_hearts_blocks_answers_and_new_lessons(api, db):
    lid = lesson_id(db, "Introductions", 1)
    attempt = api.start(lid)
    ex, last = _drain_hearts(api, attempt)
    assert last["learner"]["hearts"] == 0 and last["out_of_hearts"] is True
    r = api.answer(attempt["attempt_id"], ex["id"], api.correct_answer(api.key(ex["id"])))
    assert r.status_code == 409 and r.json()["error"]["code"] == "out_of_hearts"
    r = api.c.post(f"/api/lessons/{lid}/attempts", json={})
    assert r.status_code == 409 and r.json()["error"]["code"] == "out_of_hearts"
    assert api.me()["hearts"] == 0  # blocked requests never go negative


def test_refill_costs_gems_and_validates(api, db, settings):
    attempt = api.start(lesson_id(db, "Introductions", 1))
    assert api.c.post("/api/hearts/refill").json()["error"]["code"] == "hearts_full"
    _drain_hearts(api, attempt)
    gems = api.me()["gems"]
    r = api.c.post("/api/hearts/refill")
    assert r.status_code == 200
    assert r.json()["learner"]["hearts"] == 5
    assert r.json()["learner"]["gems"] == gems - settings.refill_cost_gems
    # drain gems below cost
    from app.models import UserStats

    db.query(UserStats).update({"gems": 10, "hearts": 1})
    db.commit()
    r = api.c.post("/api/hearts/refill")
    assert r.status_code == 402 and r.json()["error"]["code"] == "insufficient_gems"


def test_practice_session_restores_one_heart_and_gives_no_xp(api, db):
    attempt = api.start(lesson_id(db, "Introductions", 1))
    _drain_hearts(api, attempt)
    xp = api.me()["xp_total"]
    practice = api.c.post("/api/hearts/practice")
    assert practice.status_code == 200 and practice.json()["kind"] == "practice"
    p = practice.json()
    for ex in p["exercises"]:  # wrong answers are free in practice
        api.answer(p["attempt_id"], ex["id"], api.wrong_answer(api.key(ex["id"])))
    assert api.me()["hearts"] == 0
    api.solve_all(p)
    done = api.complete(p["lesson_id"], p["attempt_id"]).json()
    assert done["hearts_gained"] == 1 and done["xp_total_gained"] == 0
    me = api.me()
    assert me["hearts"] == 1 and me["xp_total"] == xp
    # completing it again does not give another heart
    again = api.complete(p["lesson_id"], p["attempt_id"]).json()
    assert again["already_completed"] is True and api.me()["hearts"] == 1


def test_hearts_regenerate_with_time(api, db, clock, settings):
    attempt = api.start(lesson_id(db, "Introductions", 1))
    _drain_hearts(api, attempt)
    assert api.me()["next_heart_in_seconds"] == settings.heart_regen_seconds
    clock.advance(seconds=settings.heart_regen_seconds)
    assert api.me()["hearts"] == 1
    clock.advance(seconds=settings.heart_regen_seconds * 10)
    me = api.me()
    assert me["hearts"] == 5 and me["next_heart_in_seconds"] is None


# ------------------------------------------------------------------ streak + daily goal
def test_two_lessons_same_day_increment_streak_once(api, db):
    _play_lesson(api, lesson_id(db, "Introductions", 1))
    _play_lesson(api, lesson_id(db, "Introductions", 2))
    me = api.me()
    assert me["current_streak"] == 5 and me["longest_streak"] == 6
    assert me["daily_xp"] == 44


def test_streak_continues_next_day_and_resets_after_a_gap(api, db, clock):
    _play_lesson(api, lesson_id(db, "Introductions", 1))
    clock.advance(days=1)
    assert api.me()["current_streak"] == 5 and api.me()["streak_active_today"] is False
    assert api.me()["daily_xp"] == 0  # new day, daily goal starts over
    _play_lesson(api, lesson_id(db, "Introductions", 2))
    assert api.me()["current_streak"] == 6
    clock.advance(days=3)
    assert api.me()["current_streak"] == 0  # displayed as broken immediately
    _play_lesson(api, lesson_id(db, "Everyday Words", 1))
    me = api.me()
    assert me["current_streak"] == 1 and me["longest_streak"] == 6


def test_daily_goal_setting(api):
    assert api.c.patch("/api/me/daily-goal", json={"daily_goal_xp": 50}).json()["daily_goal_xp"] == 50
    assert api.me()["daily_goal_xp"] == 50
    r = api.c.patch("/api/me/daily-goal", json={"daily_goal_xp": 7})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_daily_goal"


# ------------------------------------------------------------------ profile + leaderboard
def test_leaderboard_is_derived_and_updates(api, db):
    board = api.c.get("/api/leaderboard").json()
    assert [r["display_name"] for r in board["rows"]][:4] == ["Maya", "Diego", "Priya", "Liam"]
    assert board["current_user"]["rank"] == 5 and board["current_user"]["xp"] == 124
    assert sum(r["is_current_user"] for r in board["rows"]) == 1
    _play_lesson(api, lesson_id(db, "Introductions", 1))
    board = api.c.get("/api/leaderboard").json()
    assert board["current_user"]["xp"] == 146 and board["current_user"]["rank"] == 3


def test_profile_stats_update_after_lesson(api, db):
    before = api.c.get("/api/me/stats").json()
    assert before["lessons_completed"] == 2 and before["skills_completed"] == 1
    assert before["total_skills"] == 9 and before["total_lessons"] == 18
    assert len(before["week"]) == 7
    _play_lesson(api, lesson_id(db, "Introductions", 1))
    after = api.c.get("/api/me/stats").json()
    assert after["lessons_completed"] == 3
    assert after["week"][-1]["xp"] == 22
    assert after["learner"]["xp_total"] == 146


def test_pair_probe_is_refused_for_locked_lessons(api, db):
    from app.models import Exercise, Lesson

    locked = lesson_id(db, "Everyday Words", 1)
    ex = db.query(Exercise).filter_by(lesson_id=locked, type="match_pairs").one()
    r = api.c.post(f"/api/exercises/{ex.id}/check-pair", json={"left_id": "l0", "right_id": "r0"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "lesson_locked"
    assert db.get(Lesson, locked) is not None

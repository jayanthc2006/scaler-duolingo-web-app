"""Match pairs: a wrong pair is a mistake like any wrong answer (-1 heart), decided and recorded by the server."""
from sqlalchemy import func, select

from app.models import ExerciseAttempt
from tests.conftest import lesson_id


def _setup(api, db, skill="Introductions", kind="lesson"):
    attempt = api.start(lesson_id(db, skill, 1), kind)
    ex = next(e for e in attempt["exercises"] if e["type"] == "match_pairs")
    pairs = api.key(ex["id"]).answer["pairs"]  # {left_id: right_id}
    return attempt, ex, pairs


_n = 0


def _check(api, attempt, ex, left, right, rid=None):
    global _n
    _n += 1
    return api.c.post(
        f"/api/exercises/{ex['id']}/check-pair",
        json={
            "attempt_id": attempt["attempt_id"], "request_id": rid or f"pair-{_n:06d}",
            "left_id": left, "right_id": right,
        },
    )


def _wrong_right(pairs, left):
    return next(r for l, r in pairs.items() if l != left)


def test_correct_pair_costs_nothing(api, db):
    attempt, ex, pairs = _setup(api, db)
    left, right = next(iter(pairs.items()))
    r = _check(api, attempt, ex, left, right)
    assert r.status_code == 200
    assert (r.json()["match"], r.json()["heart_lost"], r.json()["out_of_hearts"]) == (True, False, False)
    assert api.me()["hearts"] == 5
    assert db.scalar(select(func.count()).select_from(ExerciseAttempt)) == 0  # nothing recorded for a right pair


def test_wrong_pair_costs_exactly_one_heart(api, db):
    attempt, ex, pairs = _setup(api, db)
    left = next(iter(pairs))
    r = _check(api, attempt, ex, left, _wrong_right(pairs, left))
    body = r.json()
    assert (body["match"], body["heart_lost"], body["out_of_hearts"]) == (False, True, False)
    assert body["learner"]["hearts"] == 4 == api.me()["hearts"]


def test_each_wrong_pair_costs_one_heart_and_a_right_pair_in_between_is_free(api, db):
    attempt, ex, pairs = _setup(api, db)
    (l0, r0), (l1, _) = list(pairs.items())[:2]
    _check(api, attempt, ex, l0, _wrong_right(pairs, l0))
    assert api.me()["hearts"] == 4
    assert _check(api, attempt, ex, l0, r0).json()["heart_lost"] is False
    assert api.me()["hearts"] == 4
    _check(api, attempt, ex, l1, _wrong_right(pairs, l1))
    assert api.me()["hearts"] == 3


def test_wrong_pair_counts_as_a_mistake_and_never_blocks_completion(api, db):
    attempt, ex, pairs = _setup(api, db)
    left = next(iter(pairs))
    _check(api, attempt, ex, left, _wrong_right(pairs, left))
    api.solve_all(attempt)  # the normal answer path is unchanged: all five types still solve
    done = api.complete(attempt["lesson_id"], attempt["attempt_id"]).json()
    assert done["mistakes"] == 1
    assert done["xp_total_gained"] == 6 * 2 + 10  # +2 per exercise (the pairs exercise included) + completion bonus


def test_same_request_id_is_a_replay_not_a_second_charge(api, db):
    attempt, ex, pairs = _setup(api, db)
    left = next(iter(pairs))
    wrong = _wrong_right(pairs, left)
    first = _check(api, attempt, ex, left, wrong, rid="pair-same-0001").json()
    again = _check(api, attempt, ex, left, wrong, rid="pair-same-0001").json()
    assert first["heart_lost"] and again["heart_lost"] and again["match"] is False
    assert api.me()["hearts"] == 4
    assert db.scalar(select(func.count()).select_from(ExerciseAttempt)) == 1
    other = _check(api, attempt, ex, left, wrong, rid="pair-new-0002").json()  # a new tap is a new mistake
    assert other["heart_lost"] and api.me()["hearts"] == 3


def test_request_id_cannot_be_reused_for_another_exercise(api, db):
    attempt, ex, pairs = _setup(api, db)
    left = next(iter(pairs))
    _check(api, attempt, ex, left, _wrong_right(pairs, left), rid="pair-reuse-0001")
    mc = next(e for e in attempt["exercises"] if e["type"] == "multiple_choice")
    r = api.answer(attempt["attempt_id"], mc["id"], api.wrong_answer(api.key(mc["id"])), request_id="pair-reuse-0001")
    assert r.status_code == 409 and r.json()["error"]["code"] == "request_id_reuse"


def test_running_out_of_hearts_through_pairs(api, db):
    attempt, ex, pairs = _setup(api, db)
    left = next(iter(pairs))
    wrong = _wrong_right(pairs, left)
    results = [_check(api, attempt, ex, left, wrong).json() for _ in range(5)]
    assert [r["learner"]["hearts"] for r in results] == [4, 3, 2, 1, 0]
    assert [r["out_of_hearts"] for r in results] == [False, False, False, False, True]
    blocked = _check(api, attempt, ex, left, wrong)  # no further pair attempts at 0 hearts
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "out_of_hearts"
    assert api.me()["hearts"] == 0
    assert _check(api, attempt, ex, left, pairs[left]).status_code == 409  # not even a right one


def test_practice_and_legendary_wrong_pairs_are_free_but_still_a_mistake(api, db):
    attempt, ex, pairs = _setup(api, db, skill="Greetings", kind="practice")
    left = next(iter(pairs))
    r = _check(api, attempt, ex, left, _wrong_right(pairs, left)).json()
    assert (r["match"], r["heart_lost"]) == (False, False)
    assert api.me()["hearts"] == 5

    legendary = api.c.post("/api/legendary/start").json()
    lex = next(e for e in legendary["exercises"] if e["type"] == "match_pairs")
    lpairs = api.key(lex["id"]).answer["pairs"]
    ll = next(iter(lpairs))
    r = _check(api, legendary, lex, ll, _wrong_right(lpairs, ll)).json()
    assert r["heart_lost"] is False and api.me()["hearts"] == 5


def test_pair_check_needs_a_real_open_attempt_of_this_learner_and_lesson(api, db):
    attempt, ex, pairs = _setup(api, db)
    left, right = next(iter(pairs.items()))
    body = {"request_id": "pair-auth-0001", "left_id": left, "right_id": right}
    url = f"/api/exercises/{ex['id']}/check-pair"
    assert api.c.post(url, json={**body, "attempt_id": 987654}).status_code == 404  # unknown attempt
    assert api.c.post(url, json=body).status_code == 422  # the client cannot opt out by omitting the attempt
    other = api.start(lesson_id(db, "Greetings", 1), "practice")  # an open attempt of a different lesson
    wrong_lesson = api.c.post(url, json={**body, "attempt_id": other["attempt_id"]})
    assert wrong_lesson.json()["error"]["code"] == "exercise_not_in_attempt"
    api.solve_all(attempt)
    api.complete(attempt["lesson_id"], attempt["attempt_id"])
    closed = api.c.post(url, json={**body, "attempt_id": attempt["attempt_id"]})
    assert closed.json()["error"]["code"] == "attempt_closed"

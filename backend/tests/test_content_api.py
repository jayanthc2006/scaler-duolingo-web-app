from tests.conftest import lesson_id


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "ok"}


def test_me_returns_seeded_learner(client):
    me = client.get("/api/me").json()
    assert me["display_name"] == "Alex"
    assert me["hearts"] == 5 and me["max_hearts"] == 5
    assert me["current_streak"] == 4 and me["streak_active_today"] is False
    assert me["daily_xp"] == 0 and me["daily_goal_xp"] == 30


def test_path_states_reflect_learner_progress(client):
    courses = client.get("/api/courses").json()
    path = client.get(f"/api/courses/{courses[0]['id']}/path").json()
    assert [u["color"] for u in path["units"]] == ["green", "blue", "purple"]
    skills = [s for u in path["units"] for s in u["skills"]]
    assert len(skills) == 9
    assert [s["status"] for s in skills[:3]] == ["completed", "available", "locked"]
    assert all(s["status"] == "locked" for s in skills[3:])
    current = [s for s in skills if s["is_current"]]
    assert len(current) == 1 and current[0]["title"] == "Introductions"
    assert current[0]["next_lesson_id"] is not None
    assert skills[2]["next_lesson_id"] is None  # locked skills expose no lesson to start


def test_units_and_skills_endpoints(client):
    assert len(client.get("/api/units").json()) == 3
    assert len(client.get("/api/skills").json()) == 9


def test_skill_detail_and_unknown_skill(client, db):
    skill_id = client.get("/api/skills").json()[1]["id"]
    detail = client.get(f"/api/skills/{skill_id}").json()
    assert detail["status"] == "available"
    assert [l["status"] for l in detail["lessons"]] == ["available", "locked"]
    r = client.get("/api/skills/9999")
    assert r.status_code == 404 and r.json()["error"]["code"] == "skill_not_found"


def test_exercises_never_expose_answer_keys(client, db):
    lid = lesson_id(db, "Introductions", 1)
    r = client.get(f"/api/lessons/{lid}/exercises")
    assert r.status_code == 200
    exercises = r.json()
    assert {e["type"] for e in exercises} == {
        "multiple_choice", "translate", "match_pairs", "fill_blank", "type_answer"
    }
    raw = r.text
    for forbidden in ('"answer"', "accepted", "option_id", '"pairs"', '"display"', "explanation"):
        assert forbidden not in raw
    # the attempt endpoint is just as strict
    attempt = client.post(f"/api/lessons/{lid}/attempts", json={}).text
    for forbidden in ('"answer"', "accepted", '"pairs"', '"display"'):
        assert forbidden not in attempt


def test_invalid_lesson_and_exercise_ids(client, api):
    assert client.get("/api/lessons/99999").status_code == 404
    assert client.get("/api/lessons/99999/exercises").status_code == 404
    assert client.post("/api/lessons/99999/attempts", json={}).status_code == 404
    r = api.answer(1, 99999, {"text": "x"})
    assert r.status_code == 404 and r.json()["error"]["code"] == "exercise_not_found"


def test_locked_lesson_cannot_be_read_or_started(client, db):
    locked = lesson_id(db, "Everyday Words", 1)
    r = client.post(f"/api/lessons/{locked}/attempts", json={})
    assert r.status_code == 403 and r.json()["error"]["code"] == "lesson_locked"
    assert client.get(f"/api/lessons/{locked}/exercises").status_code == 403
    # second lesson of an unlocked skill is locked too
    assert client.post(f"/api/lessons/{lesson_id(db, 'Introductions', 2)}/attempts", json={}).status_code == 403


def test_completed_lesson_cannot_be_restarted_as_a_real_lesson(client, db):
    r = client.post(f"/api/lessons/{lesson_id(db, 'Greetings', 1)}/attempts", json={})
    assert r.status_code == 409 and r.json()["error"]["code"] == "lesson_already_completed"


def test_validation_errors_use_structured_shape(client, db):
    lid = lesson_id(db, "Introductions", 1)
    r = client.post(f"/api/lessons/{lid}/attempts", json={"kind": "bogus"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    r = client.post("/api/exercises/1/answer", json={"attempt_id": 1})
    assert r.status_code == 422
    assert client.get("/api/lessons/not-a-number").status_code == 422


def test_cors_allows_configured_origin(client):
    r = client.get("/api/health", headers={"Origin": "http://localhost:3000"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:3000"

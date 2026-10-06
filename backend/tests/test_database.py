"""Database-level guarantees: constraints are the last line of defence behind the services."""
import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.db.session import make_engine
from app.models import Exercise, ExerciseAttempt, LessonAttempt, User, UserStats
from app.seed.seed import seed_database
from tests.conftest import START, lesson_id


def test_foreign_keys_are_enforced(db):
    assert db.execute(text("PRAGMA foreign_keys")).scalar() == 1
    db.add(LessonAttempt(user_id=9999, lesson_id=1, started_at=START))
    with pytest.raises(IntegrityError):
        db.commit()


def test_seed_is_idempotent(db, settings):
    before = db.scalar(select(func.count()).select_from(Exercise))
    seed_database(db, START, settings)
    assert db.scalar(select(func.count()).select_from(Exercise)) == before == 108
    assert db.scalar(select(func.count()).select_from(User)) == 9


def test_seed_is_deterministic(settings):
    dumps = []
    for _ in range(2):
        engine = make_engine("sqlite://")
        Base.metadata.create_all(engine)
        with sessionmaker(bind=engine)() as s:
            seed_database(s, START, settings)
            rows = s.scalars(select(Exercise).order_by(Exercise.id))
            dumps.append([(e.type, e.prompt, e.payload, e.answer) for e in rows])
    assert dumps[0] == dumps[1]


def test_only_one_completed_attempt_per_lesson_at_db_level(db):
    lid = lesson_id(db, "Greetings", 1)  # already completed for the seeded learner
    user = db.scalar(select(User).where(User.username == "alex"))
    db.add(LessonAttempt(user_id=user.id, lesson_id=lid, kind="lesson", status="completed", started_at=START))
    with pytest.raises(IntegrityError):
        db.commit()


def test_only_one_open_attempt_per_lesson_at_db_level(db):
    lid = lesson_id(db, "Introductions", 1)
    user = db.scalar(select(User).where(User.username == "alex"))
    db.add(LessonAttempt(user_id=user.id, lesson_id=lid, started_at=START))
    db.commit()
    db.add(LessonAttempt(user_id=user.id, lesson_id=lid, started_at=START))
    with pytest.raises(IntegrityError):
        db.commit()


def test_exercise_can_only_be_solved_once_per_attempt_at_db_level(db):
    lid = lesson_id(db, "Introductions", 1)
    user = db.scalar(select(User).where(User.username == "alex"))
    attempt = LessonAttempt(user_id=user.id, lesson_id=lid, started_at=START)
    db.add(attempt)
    db.flush()
    ex = db.scalar(select(Exercise).where(Exercise.lesson_id == lid))
    for i in range(2):
        db.add(ExerciseAttempt(attempt_id=attempt.id, exercise_id=ex.id, request_id=f"r{i}",
                               is_correct=True, submitted_answer={}, created_at=START))
    with pytest.raises(IntegrityError):
        db.commit()


def test_check_constraints_reject_negative_hearts(db):
    db.execute(text("UPDATE user_stats SET hearts = 5"))
    db.commit()
    with pytest.raises(IntegrityError):
        db.execute(text("UPDATE user_stats SET hearts = -1 WHERE user_id = 1"))


def test_state_survives_engine_restart(tmp_path, settings):
    """Persistence: a file-backed database keeps learner state across 'process restarts'."""
    url = f"sqlite:///{tmp_path / 'restart.db'}"
    engine = make_engine(url)
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as s:
        seed_database(s, START, settings)
        s.get(UserStats, 1).xp_total = 999
        s.commit()
    engine.dispose()

    engine2 = make_engine(url)
    with sessionmaker(bind=engine2)() as s:
        assert s.get(UserStats, 1).xp_total == 999
        seed_database(s, START, settings)  # re-running the seed must not reset progress
        assert s.get(UserStats, 1).xp_total == 999
    engine2.dispose()

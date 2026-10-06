"""Legendary challenge: a timed re-run of a lesson the learner has already completed.

It reuses the normal engine end to end (same exercises, same /answer evaluation, same /complete
endpoint). What is specific to it lives here: choosing the lesson, the server-side clock, and the
once-per-lesson reward rule. The deadline is enforced on the server from `started_at`, so a client
that hides its timer still cannot claim a reward for a slow run.
"""
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.config import Settings
from app.core.errors import ConflictError, NotFoundError
from app.db.session import begin_write
from app.models import ExerciseAttempt, Lesson, LessonAttempt, Skill, Unit, User
from app.schemas.legendary import LegendaryEndOut, LegendaryStatusOut
from app.schemas.lesson import AttemptOut
from app.services import attempts
from app.services import learner as learner_service

KIND = "legendary"


def _lesson_ids(db: Session, user_id: int, kind: str) -> set[int]:
    return set(
        db.scalars(
            select(LessonAttempt.lesson_id).where(
                LessonAttempt.user_id == user_id,
                LessonAttempt.kind == kind,
                LessonAttempt.status == "completed",
            )
        )
    )


def unconquered_lessons(db: Session, user: User) -> list[Lesson]:
    """Completed lessons that have not yet paid out a legendary reward, in path order."""
    candidates = _lesson_ids(db, user.id, "lesson") - _lesson_ids(db, user.id, KIND)
    if not candidates:
        return []
    return list(
        db.scalars(
            select(Lesson)
            .join(Skill, Lesson.skill_id == Skill.id)
            .join(Unit, Skill.unit_id == Unit.id)
            .where(Lesson.id.in_(candidates))
            .order_by(Unit.position, Skill.position, Lesson.position)
        )
    )


def status(db: Session, user: User, settings: Settings) -> LegendaryStatusOut:
    remaining = len(unconquered_lessons(db, user))
    return LegendaryStatusOut(
        available=remaining > 0,
        remaining=remaining,
        conquered=len(_lesson_ids(db, user.id, KIND)),
        time_limit_seconds=settings.legendary_seconds,
        reward_xp=settings.legendary_xp,
        reward_gems=settings.legendary_gems,
        wrong_answer_penalty_seconds=settings.legendary_wrong_answer_penalty_seconds,
    )


def penalty_seconds(db: Session, attempt: LessonAttempt, settings: Settings) -> int:
    """Time lost to wrong answers: one fixed penalty per recorded wrong answer / wrong pair of this attempt.

    Derived from the attempt's own `exercise_attempts`, so it is server state: a refresh cannot remove it, the client
    cannot set it, and a repeated request id (which never inserts a second row) can never add it twice.
    """
    wrong = db.scalar(
        select(func.count()).select_from(ExerciseAttempt).where(
            ExerciseAttempt.attempt_id == attempt.id, ExerciseAttempt.is_correct.is_(False)
        )
    )
    return (wrong or 0) * settings.legendary_wrong_answer_penalty_seconds


def used_seconds(db: Session, attempt: LessonAttempt, now: datetime, settings: Settings) -> float:
    """Clock time used so far: real elapsed time plus accumulated wrong-answer penalties."""
    return (now - attempt.started_at).total_seconds() + penalty_seconds(db, attempt, settings)


def seconds_left(db: Session, attempt: LessonAttempt, now: datetime, settings: Settings) -> int:
    """Authoritative time left (never negative)."""
    return max(0, int(settings.legendary_seconds - used_seconds(db, attempt, now, settings) + 0.999))  # round up


def is_expired(db: Session, attempt: LessonAttempt, now: datetime, settings: Settings) -> bool:
    return used_seconds(db, attempt, now, settings) >= settings.legendary_seconds


def ensure_running(db: Session, attempt: LessonAttempt, now: datetime, settings: Settings) -> None:
    """Called before an answer is judged: a run whose (penalty-adjusted) time is up accepts nothing more."""
    if is_expired(db, attempt, now, settings):
        attempt.status = "failed"
        db.commit()
        raise ConflictError("Time is up - this challenge is over.", code="legendary_expired")


def clock_left(db: Session, attempt: LessonAttempt, now: datetime, settings: Settings) -> int | None:
    """What answer responses report so the client's countdown follows the server (None for non-legendary attempts)."""
    return seconds_left(db, attempt, now, settings) if attempt.kind == KIND else None


def _open_attempts(db: Session, user_id: int) -> list[LessonAttempt]:
    return list(
        db.scalars(
            select(LessonAttempt).where(
                LessonAttempt.user_id == user_id,
                LessonAttempt.kind == KIND,
                LessonAttempt.status == "in_progress",
            )
        )
    )


def start(db: Session, user: User, clock: Clock, settings: Settings) -> AttemptOut:
    """Start a challenge, or resume the one still running (a refresh does not reset the clock).

    A run whose time is up is closed as failed and replaced, so retrying always gets a fresh clock.
    """
    begin_write(db)  # serialise read-decide-write (see db/session.py)
    now = clock.now()
    candidates = unconquered_lessons(db, user)
    if not candidates:
        raise ConflictError(
            "No legendary challenge is available yet. Complete a lesson first.",
            code="legendary_unavailable",
        )
    playable = {lesson.id for lesson in candidates}
    attempt: LessonAttempt | None = None
    for open_attempt in _open_attempts(db, user.id):
        if attempt is None and not is_expired(db, open_attempt, now, settings) and open_attempt.lesson_id in playable:
            attempt = open_attempt
        else:
            open_attempt.status = "failed"
    db.flush()  # free the partial unique index before inserting a replacement
    if attempt is None:
        attempt = LessonAttempt(user_id=user.id, lesson_id=candidates[0].id, kind=KIND, started_at=now)
        db.add(attempt)
        db.flush()
    lesson = db.get(Lesson, attempt.lesson_id)
    assert lesson is not None
    learner = learner_service.snapshot(db, user, clock, settings)
    db.commit()
    out = attempts.build_attempt_out(db, attempt, lesson, learner)
    out.time_limit_seconds = settings.legendary_seconds
    out.seconds_left = seconds_left(db, attempt, now, settings)
    return out


def check_can_complete(db: Session, attempt: LessonAttempt, now: datetime, settings: Settings) -> None:
    """Called by /complete before any reward is applied. Closes the attempt as failed when it must not pay."""
    late = used_seconds(db, attempt, now, settings) > settings.legendary_seconds + settings.legendary_grace_seconds
    conquered = attempt.lesson_id in _lesson_ids(db, attempt.user_id, KIND)
    if late or conquered:
        attempt.status = "failed"
        db.commit()
        if late:
            raise ConflictError("Time is up - this challenge can no longer be completed.", code="legendary_expired")
        raise ConflictError("You already won the legendary challenge for this lesson.", code="legendary_already_won")


def end(db: Session, user: User, attempt_id: int) -> LegendaryEndOut:
    """Explicit End Session: abandon this run for good. Terminal and idempotent: only an in-progress attempt
    changes (to "abandoned", no reward, no progress); one that is already over is reported as is, never reopened."""
    begin_write(db)  # serialise against a concurrent start / answer / complete
    attempt = db.get(LessonAttempt, attempt_id)
    if attempt is None or attempt.user_id != user.id or attempt.kind != KIND:
        raise NotFoundError("Attempt not found.", code="attempt_not_found")
    if attempt.status == "in_progress":
        attempt.status = "abandoned"
        db.commit()
    return LegendaryEndOut(attempt_id=attempt.id, status=attempt.status)

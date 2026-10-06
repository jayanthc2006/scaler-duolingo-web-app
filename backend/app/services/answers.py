"""Answer submission: the only place correctness, heart loss and per-answer XP are decided."""
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.config import Settings
from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.db.session import begin_write
from app.models import Exercise, ExerciseAttempt, LessonAttempt, User
from app.schemas.lesson import AnswerIn, AnswerOut
from app.services import evaluation, gamification, progress
from app.services import learner as learner_service
from app.services.attempts import get_exercise


def _load_attempt(db: Session, user: User, attempt_id: int, exercise: Exercise) -> LessonAttempt:
    attempt = db.get(LessonAttempt, attempt_id)
    if attempt is None or attempt.user_id != user.id:
        raise NotFoundError("Attempt not found.", code="attempt_not_found")
    if attempt.lesson_id != exercise.lesson_id:
        raise ConflictError("Exercise does not belong to this attempt.", code="exercise_not_in_attempt")
    if attempt.status != "in_progress":
        raise ConflictError("This attempt is already finished.", code="attempt_closed")
    return attempt


def _find(db: Session, attempt_id: int, **filters: object) -> ExerciseAttempt | None:
    q = select(ExerciseAttempt).where(ExerciseAttempt.attempt_id == attempt_id)
    for col, val in filters.items():
        q = q.where(getattr(ExerciseAttempt, col) == val)
    return db.scalars(q).first()


def _result(
    row: ExerciseAttempt, exercise: Exercise, learner, *, already_solved: bool = False
) -> AnswerOut:
    return AnswerOut(
        correct=row.is_correct,
        already_solved=already_solved,
        xp_awarded=0 if already_solved else row.xp_awarded,
        heart_lost=row.heart_lost,
        out_of_hearts=learner.hearts == 0 and row.heart_lost,
        correct_answer=None if row.is_correct else exercise.answer.get("display"),
        explanation=exercise.explanation,
        learner=learner,
    )


def submit_answer(
    db: Session, user: User, exercise_id: int, body: AnswerIn, clock: Clock, settings: Settings
) -> AnswerOut:
    begin_write(db)  # serialise read-decide-write (see db/session.py)
    exercise = get_exercise(db, exercise_id)
    attempt = _load_attempt(db, user, body.attempt_id, exercise)

    # 1. Idempotent replay: same request id returns the stored outcome, no new side effects.
    replay = _find(db, attempt.id, request_id=body.request_id)
    if replay is not None:
        if replay.exercise_id != exercise.id:
            raise ConflictError("request_id was used for another exercise.", code="request_id_reuse")
        return _result(replay, exercise, learner_service.snapshot(db, user, clock, settings))

    # 2. Already solved in this attempt (e.g. double click with a fresh request id): no XP again.
    solved = _find(db, attempt.id, exercise_id=exercise.id, is_correct=True)
    if solved is not None:
        return _result(solved, exercise, learner_service.snapshot(db, user, clock, settings), already_solved=True)

    learner = learner_service.snapshot(db, user, clock, settings)  # applies heart regen
    is_lesson = attempt.kind == "lesson"
    if is_lesson and learner.hearts == 0:
        db.commit()  # persist the regen sync; nothing else changed
        raise ConflictError("You are out of hearts.", code="out_of_hearts")

    correct = evaluation.evaluate(
        exercise.type, exercise.answer, body.answer
    )  # raises 422 on malformed answers before anything is mutated

    stats, now = user.stats, clock.now()
    xp = settings.xp_per_correct_answer if (correct and is_lesson) else 0
    heart_lost = not correct and is_lesson
    if correct and is_lesson:
        gamification.record_activity(db, stats, clock.today(), xp=xp)
    if not correct:
        attempt.mistakes += 1
    if heart_lost:
        gamification.lose_heart(stats, now, settings)

    row = ExerciseAttempt(
        attempt_id=attempt.id,
        exercise_id=exercise.id,
        request_id=body.request_id,
        is_correct=correct,
        heart_lost=heart_lost,
        xp_awarded=xp,
        submitted_answer=body.answer.model_dump(exclude_none=True),
        created_at=now,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        # A concurrent identical submission won the race (unique request_id / solved index).
        db.rollback()
        winner = _find(db, attempt.id, request_id=body.request_id) or _find(
            db, attempt.id, exercise_id=exercise.id, is_correct=True
        )
        if winner is None:
            raise
        return _result(winner, exercise, learner_service.snapshot(db, user, clock, settings), already_solved=True)

    return _result(row, exercise, learner_service.snapshot(db, user, clock, settings))


def check_pair(db: Session, user: User, exercise_id: int, left_id: str, right_id: str) -> bool:
    exercise = get_exercise(db, exercise_id)
    _, _, status = progress.get_lesson_with_status(db, user.id, exercise.lesson_id)
    if status == "locked":  # the probe must not leak keys of lessons the learner cannot play yet
        raise ForbiddenError("This lesson is locked.", code="lesson_locked")
    if exercise.type != "match_pairs":
        raise ConflictError("Not a match-pairs exercise.", code="wrong_exercise_type")
    return evaluation.check_pair(exercise.answer, left_id, right_id)

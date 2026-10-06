"""Starting (or resuming) a lesson attempt and reading exercises."""
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.config import Settings
from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.models import Exercise, ExerciseAttempt, Lesson, LessonAttempt, User
from app.schemas.lesson import AttemptOut, ExercisePublic
from app.services import learner as learner_service
from app.services import progress


def public_exercises(lesson: Lesson) -> list[ExercisePublic]:
    return [
        ExercisePublic(id=e.id, position=e.position, type=e.type, prompt=e.prompt, payload=e.payload)
        for e in lesson.exercises
    ]


def _find_open(db: Session, user_id: int, lesson_id: int, kind: str) -> LessonAttempt | None:
    return db.scalar(
        select(LessonAttempt).where(
            LessonAttempt.user_id == user_id,
            LessonAttempt.lesson_id == lesson_id,
            LessonAttempt.kind == kind,
            LessonAttempt.status == "in_progress",
        )
    )


def start_attempt(
    db: Session, user: User, lesson_id: int, kind: str, clock: Clock, settings: Settings
) -> AttemptOut:
    lesson, _, status = progress.get_lesson_with_status(db, user.id, lesson_id)
    learner = learner_service.snapshot(db, user, clock, settings)

    if status == "locked":
        raise ForbiddenError("Finish the earlier lessons to unlock this one.", code="lesson_locked")
    if kind == "lesson":
        if status == "completed":
            raise ConflictError(
                "You already completed this lesson. Use practice mode.",
                code="lesson_already_completed",
            )
        if learner.hearts == 0:
            raise ConflictError("You are out of hearts.", code="out_of_hearts")
    if not lesson.exercises:
        raise ConflictError("This lesson has no exercises.", code="lesson_empty")

    attempt = _find_open(db, user.id, lesson_id, kind)
    if attempt is None:
        attempt = LessonAttempt(
            user_id=user.id, lesson_id=lesson_id, kind=kind, started_at=clock.now()
        )
        db.add(attempt)
        try:
            db.flush()
        except IntegrityError:  # concurrent start: someone else created the open attempt
            db.rollback()
            attempt = _find_open(db, user.id, lesson_id, kind)
            assert attempt is not None
    db.commit()

    solved = db.scalars(
        select(ExerciseAttempt.exercise_id).where(
            ExerciseAttempt.attempt_id == attempt.id, ExerciseAttempt.is_correct.is_(True)
        )
    ).all()
    return AttemptOut(
        attempt_id=attempt.id,
        lesson_id=lesson.id,
        lesson_title=lesson.title,
        kind=kind,  # type: ignore[arg-type]
        exercises=public_exercises(lesson),
        solved_exercise_ids=list(solved),
        learner=learner,
    )


def get_exercise(db: Session, exercise_id: int) -> Exercise:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None:
        raise NotFoundError("Exercise not found.", code="exercise_not_found")
    return exercise

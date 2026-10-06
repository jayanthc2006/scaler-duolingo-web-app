from fastapi import APIRouter

from app.core.errors import ForbiddenError
from app.deps import ClockDep, DbDep, SettingsDep, UserDep
from app.schemas.course import LessonOut
from app.schemas.lesson import (
    AnswerIn,
    AnswerOut,
    AttemptOut,
    CompleteIn,
    CompleteOut,
    ExercisePublic,
    PairCheckIn,
    PairCheckOut,
    StartAttemptIn,
)
from app.services import answers, attempts, completion, progress

router = APIRouter(tags=["lessons"])


@router.get("/lessons/{lesson_id}", response_model=LessonOut)
def get_lesson(lesson_id: int, db: DbDep, user: UserDep) -> LessonOut:
    lesson, st, status = progress.get_lesson_with_status(db, user.id, lesson_id)
    return LessonOut(
        id=lesson.id,
        title=lesson.title,
        position=lesson.position,
        skill_id=st.skill.id,
        skill_title=st.skill.title,
        unit_title=st.unit.title,
        unit_color=st.unit.color,
        status=status,
        exercise_count=len(lesson.exercises),
    )


@router.get("/lessons/{lesson_id}/exercises", response_model=list[ExercisePublic])
def get_exercises(lesson_id: int, db: DbDep, user: UserDep) -> list[ExercisePublic]:
    lesson, _, status = progress.get_lesson_with_status(db, user.id, lesson_id)
    if status == "locked":
        raise ForbiddenError("This lesson is locked.", code="lesson_locked")
    return attempts.public_exercises(lesson)


@router.post("/lessons/{lesson_id}/attempts", response_model=AttemptOut)
def start_attempt(
    lesson_id: int,
    body: StartAttemptIn,
    db: DbDep,
    user: UserDep,
    clock: ClockDep,
    settings: SettingsDep,
) -> AttemptOut:
    """Start (or resume) an attempt. Returns the exercises without answer keys."""
    return attempts.start_attempt(db, user, lesson_id, body.kind, clock, settings)


@router.post("/exercises/{exercise_id}/answer", response_model=AnswerOut)
def submit_answer(
    exercise_id: int,
    body: AnswerIn,
    db: DbDep,
    user: UserDep,
    clock: ClockDep,
    settings: SettingsDep,
) -> AnswerOut:
    return answers.submit_answer(db, user, exercise_id, body, clock, settings)


@router.post("/exercises/{exercise_id}/check-pair", response_model=PairCheckOut)
def check_pair(exercise_id: int, body: PairCheckIn, db: DbDep, user: UserDep) -> PairCheckOut:
    """Side-effect free probe so match-pairs can flash an invalid pair immediately."""
    return PairCheckOut(match=answers.check_pair(db, user, exercise_id, body.left_id, body.right_id))


@router.post("/lessons/{lesson_id}/complete", response_model=CompleteOut)
def complete_lesson(
    lesson_id: int,
    body: CompleteIn,
    db: DbDep,
    user: UserDep,
    clock: ClockDep,
    settings: SettingsDep,
) -> CompleteOut:
    return completion.complete_attempt(db, user, lesson_id, body.attempt_id, clock, settings)

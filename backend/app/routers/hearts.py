from fastapi import APIRouter

from app.deps import ClockDep, DbDep, SettingsDep, UserDep
from app.schemas.learner import HeartsOut
from app.schemas.lesson import AttemptOut
from app.services import attempts, profile

router = APIRouter(prefix="/hearts", tags=["hearts"])


@router.post("/practice", response_model=AttemptOut)
def start_practice(db: DbDep, user: UserDep, clock: ClockDep, settings: SettingsDep) -> AttemptOut:
    """Start a practice session; completing it (POST /lessons/{id}/complete) restores a heart."""
    lesson_id = profile.pick_practice_lesson(db, user)
    return attempts.start_attempt(db, user, lesson_id, "practice", clock, settings)


@router.post("/refill", response_model=HeartsOut)
def refill(db: DbDep, user: UserDep, clock: ClockDep, settings: SettingsDep) -> HeartsOut:
    return HeartsOut(learner=profile.refill_hearts(db, user, clock, settings))

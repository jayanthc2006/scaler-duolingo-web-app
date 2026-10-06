from fastapi import APIRouter

from app.deps import ClockDep, DbDep, SettingsDep, UserDep
from app.schemas.learner import HeartsOut
from app.schemas.lesson import AttemptOut
from app.services import hearts

router = APIRouter(prefix="/hearts", tags=["hearts"])


@router.post("/practice", response_model=AttemptOut)
def start_practice(db: DbDep, user: UserDep, clock: ClockDep, settings: SettingsDep) -> AttemptOut:
    """Start a practice session; completing it (POST /lessons/{id}/complete) restores a heart."""
    return hearts.start_practice(db, user, clock, settings)


@router.post("/refill", response_model=HeartsOut)
def refill(db: DbDep, user: UserDep, clock: ClockDep, settings: SettingsDep) -> HeartsOut:
    return HeartsOut(learner=hearts.refill_hearts(db, user, clock, settings))

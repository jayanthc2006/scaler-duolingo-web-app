from fastapi import APIRouter

from app.deps import ClockDep, DbDep, IdPath, SettingsDep, UserDep
from app.schemas.legendary import LegendaryEndOut, LegendaryStatusOut
from app.schemas.lesson import AttemptOut
from app.services import legendary

router = APIRouter(prefix="/legendary", tags=["legendary"])


@router.get("", response_model=LegendaryStatusOut)
def legendary_status(db: DbDep, user: UserDep, settings: SettingsDep) -> LegendaryStatusOut:
    return legendary.status(db, user, settings)


@router.post("/start", response_model=AttemptOut)
def start_legendary(db: DbDep, user: UserDep, clock: ClockDep, settings: SettingsDep) -> AttemptOut:
    """Start (or resume) the timed challenge. Answers use POST /exercises/{id}/answer and the win is
    claimed with POST /lessons/{lesson_id}/complete, exactly like a lesson."""
    return legendary.start(db, user, clock, settings)


@router.post("/{attempt_id}/end", response_model=LegendaryEndOut)
def end_legendary(attempt_id: IdPath, db: DbDep, user: UserDep) -> LegendaryEndOut:
    """Explicit End Session: abandon this attempt (no reward). Repeating the call is harmless."""
    return legendary.end(db, user, attempt_id)

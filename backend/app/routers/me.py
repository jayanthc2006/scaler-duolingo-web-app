from fastapi import APIRouter

from app.deps import ClockDep, DbDep, SettingsDep, UserDep
from app.schemas.learner import DailyGoalIn, LearnerOut, ProfileOut
from app.services import learner as learner_service
from app.services import profile

router = APIRouter(prefix="/me", tags=["learner"])


@router.get("", response_model=LearnerOut)
def get_me(db: DbDep, user: UserDep, clock: ClockDep, settings: SettingsDep) -> LearnerOut:
    out = learner_service.snapshot(db, user, clock, settings)
    db.commit()  # persists lazy heart regeneration
    return out


@router.get("/stats", response_model=ProfileOut)
def get_stats(db: DbDep, user: UserDep, clock: ClockDep, settings: SettingsDep) -> ProfileOut:
    return profile.build_profile(db, user, clock, settings)


@router.patch("/daily-goal", response_model=LearnerOut)
def update_daily_goal(
    body: DailyGoalIn, db: DbDep, user: UserDep, clock: ClockDep, settings: SettingsDep
) -> LearnerOut:
    return profile.set_daily_goal(db, user, body.daily_goal_xp, clock, settings)

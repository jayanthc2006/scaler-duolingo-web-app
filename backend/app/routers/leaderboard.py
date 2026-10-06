from fastapi import APIRouter

from app.deps import ClockDep, DbDep, UserDep
from app.schemas.learner import LeaderboardOut
from app.services import leaderboard as leaderboard_service

router = APIRouter(tags=["leaderboard"])


@router.get("/leaderboard", response_model=LeaderboardOut)
def leaderboard(db: DbDep, user: UserDep, clock: ClockDep) -> LeaderboardOut:
    return leaderboard_service.build_leaderboard(db, user, clock)

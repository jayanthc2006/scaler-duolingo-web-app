"""Weekly leaderboard, derived from daily_activity on every request (rank is never stored)."""
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.models import DailyActivity, User
from app.schemas.learner import LeaderboardOut, LeaderboardRow


def build_leaderboard(db: Session, user: User, clock: Clock, limit: int = 10) -> LeaderboardOut:
    """Weekly XP (last 7 UTC days) computed from daily_activity - ranking is never stored."""
    today = clock.today()
    start = today - timedelta(days=6)
    weekly_xp = func.coalesce(func.sum(DailyActivity.xp_earned), 0)
    rows = db.execute(
        select(User.id, User.display_name, User.avatar_color, weekly_xp.label("xp"))
        .outerjoin(
            DailyActivity,
            (DailyActivity.user_id == User.id) & (DailyActivity.activity_date >= start),
        )
        .group_by(User.id)
        .order_by(weekly_xp.desc(), User.display_name.asc(), User.id.asc())
    ).all()
    ranked = [
        LeaderboardRow(
            rank=i, user_id=r.id, display_name=r.display_name, avatar_color=r.avatar_color,
            xp=r.xp, is_current_user=r.id == user.id,
        )
        for i, r in enumerate(rows, start=1)
    ]
    me = next(r for r in ranked if r.is_current_user)
    return LeaderboardOut(period_start=start, period_end=today, rows=ranked[:limit], current_user=me)

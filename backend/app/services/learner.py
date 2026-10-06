"""Loading the current learner and projecting their state for the API."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.config import Settings
from app.core.errors import NotFoundError
from app.models import User
from app.schemas.learner import LearnerOut
from app.services import gamification


def get_user_by_username(db: Session, username: str) -> User:
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        raise NotFoundError(
            "Default learner not found. Run `python -m app.seed` first.", code="user_not_found"
        )
    return user


def refresh(db: Session, user: User, clock: Clock, settings: Settings) -> LearnerOut:
    """Snapshot + persist lazy heart regeneration (the only write a plain read can cause)."""
    out = snapshot(db, user, clock, settings)
    db.commit()
    return out


def snapshot(db: Session, user: User, clock: Clock, settings: Settings) -> LearnerOut:
    """Apply lazy heart regeneration (mutates, caller commits) and project the learner state."""
    stats = user.stats
    now, today = clock.now(), clock.today()
    gamification.sync_hearts(stats, now, settings)
    return LearnerOut(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        avatar_color=user.avatar_color,
        xp_total=stats.xp_total,
        hearts=stats.hearts,
        max_hearts=settings.max_hearts,
        next_heart_in_seconds=gamification.seconds_until_next_heart(stats, now, settings),
        gems=stats.gems,
        refill_cost_gems=settings.refill_cost_gems,
        current_streak=gamification.effective_streak(stats, today),
        longest_streak=stats.longest_streak,
        streak_active_today=stats.last_activity_date == today,
        daily_goal_xp=stats.daily_goal_xp,
        daily_xp=gamification.get_daily_xp(db, user.id, today),
    )

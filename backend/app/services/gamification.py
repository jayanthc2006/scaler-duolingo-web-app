"""Hearts, streak, XP and daily-activity rules. All time comes from arguments (never the OS)."""
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import ConflictError
from app.models import DailyActivity, UserStats


# ---------------------------------------------------------------- hearts
def sync_hearts(stats: UserStats, now: datetime, settings: Settings) -> None:
    """Lazy regeneration: +1 heart per `heart_regen_seconds` elapsed since the anchor."""
    if stats.hearts >= settings.max_hearts:
        stats.hearts_updated_at = now
        return
    gained = int((now - stats.hearts_updated_at).total_seconds() // settings.heart_regen_seconds)
    if gained <= 0:
        return
    stats.hearts = min(settings.max_hearts, stats.hearts + gained)
    if stats.hearts >= settings.max_hearts:
        stats.hearts_updated_at = now
    else:
        stats.hearts_updated_at += timedelta(seconds=gained * settings.heart_regen_seconds)


def seconds_until_next_heart(stats: UserStats, now: datetime, settings: Settings) -> int | None:
    if stats.hearts >= settings.max_hearts:
        return None
    elapsed = (now - stats.hearts_updated_at).total_seconds()
    return max(0, int(settings.heart_regen_seconds - elapsed))


def lose_heart(stats: UserStats, now: datetime, settings: Settings) -> None:
    if stats.hearts <= 0:
        raise ConflictError("You are out of hearts.", code="out_of_hearts")
    if stats.hearts >= settings.max_hearts:
        stats.hearts_updated_at = now  # regen clock starts when we leave "full"
    stats.hearts -= 1


def add_hearts(stats: UserStats, amount: int, now: datetime, settings: Settings) -> None:
    if stats.hearts >= settings.max_hearts:
        return
    stats.hearts = min(settings.max_hearts, stats.hearts + amount)
    if stats.hearts >= settings.max_hearts:
        stats.hearts_updated_at = now


# ---------------------------------------------------------------- streak
def apply_streak(stats: UserStats, today: date) -> bool:
    """Advance the streak for activity on `today`. Returns True if it changed."""
    last = stats.last_activity_date
    if last is not None and last >= today:
        return False  # same day: never increment twice
    stats.current_streak = stats.current_streak + 1 if last == today - timedelta(days=1) else 1
    stats.longest_streak = max(stats.longest_streak, stats.current_streak)
    stats.last_activity_date = today
    return True


def effective_streak(stats: UserStats, today: date) -> int:
    """What to display: a streak not continued by yesterday is already broken."""
    last = stats.last_activity_date
    if last is None or last < today - timedelta(days=1):
        return 0
    return stats.current_streak


# ---------------------------------------------------------------- xp + activity
def get_daily_xp(db: Session, user_id: int, today: date) -> int:
    row = db.scalar(
        select(DailyActivity).where(
            DailyActivity.user_id == user_id, DailyActivity.activity_date == today
        )
    )
    return row.xp_earned if row else 0


def record_activity(
    db: Session, stats: UserStats, today: date, *, xp: int = 0, lessons: int = 0
) -> None:
    """Single entry point for 'the learner did something'. Updates total XP, today's activity
    row and the streak."""
    row = db.scalar(
        select(DailyActivity).where(
            DailyActivity.user_id == stats.user_id, DailyActivity.activity_date == today
        )
    )
    if row is None:
        row = DailyActivity(
            user_id=stats.user_id, activity_date=today, xp_earned=0, lessons_completed=0
        )
        db.add(row)
    row.xp_earned += xp
    row.lessons_completed += lessons
    stats.xp_total += xp
    apply_streak(stats, today)

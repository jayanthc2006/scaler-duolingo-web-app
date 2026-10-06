"""Profile, leaderboard, hearts actions, daily-goal setting."""
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.config import Settings
from app.core.errors import AppError, ConflictError
from app.models import DailyActivity, Lesson, LessonAttempt, Skill, User
from app.schemas.learner import (
    DayXp,
    LeaderboardOut,
    LeaderboardRow,
    LearnerOut,
    ProfileOut,
)
from app.services import achievements, gamification, progress
from app.services import learner as learner_service

DAILY_GOAL_CHOICES = (10, 20, 30, 50)


def build_profile(db: Session, user: User, clock: Clock, settings: Settings) -> ProfileOut:
    learner = learner_service.snapshot(db, user, clock, settings)
    db.commit()  # persist heart regeneration
    today = clock.today()
    start = today - timedelta(days=6)
    xp_by_day = {
        d: xp
        for d, xp in db.execute(
            select(DailyActivity.activity_date, DailyActivity.xp_earned).where(
                DailyActivity.user_id == user.id, DailyActivity.activity_date >= start
            )
        )
    }
    metrics = achievements.metrics(db, user)
    path = progress.build_path(db, user.id)
    return ProfileOut(
        learner=learner,
        joined_at=user.created_at,
        lessons_completed=metrics["lessons"],
        skills_completed=metrics["skills"],
        total_skills=db.scalar(select(func.count()).select_from(Skill)) or 0,
        total_lessons=db.scalar(select(func.count()).select_from(Lesson)) or 0,
        course_title=path.course.title,
        week=[
            DayXp(date=start + timedelta(days=i), xp=xp_by_day.get(start + timedelta(days=i), 0))
            for i in range(7)
        ],
        achievements=achievements.list_for_user(db, user),
    )


def build_leaderboard(
    db: Session, user: User, clock: Clock, limit: int = 10
) -> LeaderboardOut:
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


def refill_hearts(db: Session, user: User, clock: Clock, settings: Settings) -> LearnerOut:
    stats = user.stats
    now = clock.now()
    gamification.sync_hearts(stats, now, settings)
    if stats.hearts >= settings.max_hearts:
        raise ConflictError("Your hearts are already full.", code="hearts_full")
    if stats.gems < settings.refill_cost_gems:
        raise AppError(
            f"You need {settings.refill_cost_gems} gems to refill.",
            code="insufficient_gems",
            status_code=402,
        )
    stats.gems -= settings.refill_cost_gems
    stats.hearts = settings.max_hearts
    stats.hearts_updated_at = now
    db.commit()
    return learner_service.snapshot(db, user, clock, settings)


def set_daily_goal(db: Session, user: User, xp: int, clock: Clock, settings: Settings) -> LearnerOut:
    if xp not in DAILY_GOAL_CHOICES:
        raise AppError(
            f"Daily goal must be one of {list(DAILY_GOAL_CHOICES)}.",
            code="invalid_daily_goal",
            status_code=422,
        )
    user.stats.daily_goal_xp = xp
    db.commit()
    return learner_service.snapshot(db, user, clock, settings)


def pick_practice_lesson(db: Session, user: User) -> int:
    """Most recently completed lesson, or the first unlocked lesson for brand-new learners."""
    last = db.scalar(
        select(LessonAttempt.lesson_id)
        .where(
            LessonAttempt.user_id == user.id,
            LessonAttempt.kind == "lesson",
            LessonAttempt.status == "completed",
        )
        .order_by(LessonAttempt.completed_at.desc(), LessonAttempt.id.desc())
    )
    if last is not None:
        return last
    first_skill = db.scalar(select(Skill.id).order_by(Skill.unit_id, Skill.position))
    lesson_id = db.scalar(
        select(Lesson.id).where(Lesson.skill_id == first_skill).order_by(Lesson.position)
    )
    if lesson_id is None:
        raise ConflictError("No lesson available for practice.", code="no_practice_lesson")
    return lesson_id

"""Profile statistics and the daily-goal setting."""
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.config import Settings
from app.core.errors import AppError
from app.models import DailyActivity, Lesson, Skill, User
from app.schemas.learner import DayXp, LearnerOut, ProfileOut
from app.services import achievements, progress
from app.services import learner as learner_service

DAILY_GOAL_CHOICES = (10, 20, 30, 50)


def build_profile(db: Session, user: User, clock: Clock, settings: Settings) -> ProfileOut:
    learner = learner_service.refresh(db, user, clock, settings)
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

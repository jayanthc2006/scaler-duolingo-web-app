"""Achievements are data rows (metric + threshold); unlocking is a pure comparison."""
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Achievement,
    LessonAttempt,
    User,
    UserAchievement,
    UserSkillProgress,
)
from app.schemas.learner import AchievementOut


def metrics(db: Session, user: User) -> dict[str, int]:
    lessons = db.scalar(
        select(func.count()).select_from(LessonAttempt).where(
            LessonAttempt.user_id == user.id,
            LessonAttempt.kind == "lesson",
            LessonAttempt.status == "completed",
        )
    )
    skills = db.scalar(
        select(func.count()).select_from(UserSkillProgress).where(
            UserSkillProgress.user_id == user.id, UserSkillProgress.completed_at.is_not(None)
        )
    )
    legendaries = db.scalar(
        select(func.count()).select_from(LessonAttempt).where(
            LessonAttempt.user_id == user.id,
            LessonAttempt.kind == "legendary",
            LessonAttempt.status == "completed",
        )
    )
    return {
        "legendaries": legendaries or 0,
        "xp_total": user.stats.xp_total,
        "current_streak": user.stats.current_streak,
        "lessons": lessons or 0,
        "skills": skills or 0,
    }


def award_new(db: Session, user: User, now: datetime) -> list[AchievementOut]:
    owned = set(
        db.scalars(select(UserAchievement.achievement_id).where(UserAchievement.user_id == user.id))
    )
    values = metrics(db, user)
    unlocked: list[AchievementOut] = []
    for ach in db.scalars(select(Achievement).order_by(Achievement.id)):
        if ach.id in owned or values.get(ach.metric, 0) < ach.threshold:
            continue
        db.add(UserAchievement(user_id=user.id, achievement_id=ach.id, unlocked_at=now))
        unlocked.append(
            AchievementOut(
                code=ach.code, title=ach.title, description=ach.description,
                icon=ach.icon, unlocked=True, unlocked_at=now,
            )
        )
    return unlocked


def list_for_user(db: Session, user: User) -> list[AchievementOut]:
    unlocked_at = {
        ua.achievement_id: ua.unlocked_at
        for ua in db.scalars(select(UserAchievement).where(UserAchievement.user_id == user.id))
    }
    return [
        AchievementOut(
            code=a.code, title=a.title, description=a.description, icon=a.icon,
            unlocked=a.id in unlocked_at, unlocked_at=unlocked_at.get(a.id),
        )
        for a in db.scalars(select(Achievement).order_by(Achievement.id))
    ]

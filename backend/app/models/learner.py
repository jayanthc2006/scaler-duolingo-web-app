"""Learner state: everything that changes while the user plays."""
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(40), unique=True)
    display_name: Mapped[str] = mapped_column(String(60))
    avatar_color: Mapped[str] = mapped_column(String(16), default="blue")
    created_at: Mapped[datetime] = mapped_column(DateTime)

    stats: Mapped["UserStats"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class UserStats(Base):
    """1:1 with users. Counters the app reads constantly; kept off `users` for clarity."""

    __tablename__ = "user_stats"
    __table_args__ = (
        CheckConstraint("hearts >= 0", name="ck_hearts_nonneg"),
        CheckConstraint("gems >= 0", name="ck_gems_nonneg"),
        CheckConstraint("xp_total >= 0", name="ck_xp_nonneg"),
        CheckConstraint(
            "current_streak >= 0 AND longest_streak >= current_streak", name="ck_streak"
        ),
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    xp_total: Mapped[int] = mapped_column(default=0)
    hearts: Mapped[int] = mapped_column(default=5)
    hearts_updated_at: Mapped[datetime] = mapped_column(DateTime)  # regen anchor
    gems: Mapped[int] = mapped_column(default=0)
    current_streak: Mapped[int] = mapped_column(default=0)
    longest_streak: Mapped[int] = mapped_column(default=0)
    last_activity_date: Mapped[date | None] = mapped_column(Date, default=None)
    daily_goal_xp: Mapped[int] = mapped_column(default=30)

    user: Mapped[User] = relationship(back_populates="stats")


class UserSkillProgress(Base):
    __tablename__ = "user_skill_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "skill_id"),
        CheckConstraint("lessons_completed >= 0", name="ck_lessons_nonneg"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    skill_id: Mapped[int] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"))
    lessons_completed: Mapped[int] = mapped_column(default=0)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)


class LessonAttempt(Base):
    """One run through a lesson. kind='practice' only refills a heart (no XP); kind='legendary' is the
    timed challenge (status may also become 'failed' or 'abandoned')."""

    __tablename__ = "lesson_attempts"
    __table_args__ = (
        # at most one open attempt per lesson & kind -> start is resumable, not duplicable
        Index(
            "uq_attempt_open",
            "user_id",
            "lesson_id",
            "kind",
            unique=True,
            sqlite_where=text("status = 'in_progress'"),
        ),
        # a real lesson can be completed exactly once per learner
        Index(
            "uq_attempt_completed_lesson",
            "user_id",
            "lesson_id",
            unique=True,
            sqlite_where=text("kind = 'lesson' AND status = 'completed'"),
        ),
        # a legendary reward can be won at most once per lesson
        Index(
            "uq_attempt_completed_legendary",
            "user_id",
            "lesson_id",
            unique=True,
            sqlite_where=text("kind = 'legendary' AND status = 'completed'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id"))
    kind: Mapped[str] = mapped_column(String(12), default="lesson")  # lesson | practice | legendary
    # in_progress | completed | failed | abandoned
    status: Mapped[str] = mapped_column(String(16), default="in_progress")
    xp_awarded: Mapped[int] = mapped_column(default=0)  # completion bonus only
    gems_awarded: Mapped[int] = mapped_column(default=0)
    mistakes: Mapped[int] = mapped_column(default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)

    exercise_attempts: Mapped[list["ExerciseAttempt"]] = relationship(
        back_populates="attempt", cascade="all, delete-orphan"
    )


class ExerciseAttempt(Base):
    __tablename__ = "exercise_attempts"
    __table_args__ = (
        UniqueConstraint("attempt_id", "request_id"),  # idempotency key
        # an exercise is "solved" at most once per attempt -> XP cannot be double awarded
        Index(
            "uq_exercise_solved",
            "attempt_id",
            "exercise_id",
            unique=True,
            sqlite_where=text("is_correct = 1"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("lesson_attempts.id", ondelete="CASCADE"), index=True
    )
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"))
    request_id: Mapped[str] = mapped_column(String(64))
    is_correct: Mapped[bool]
    heart_lost: Mapped[bool] = mapped_column(default=False)
    xp_awarded: Mapped[int] = mapped_column(default=0)
    submitted_answer: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime)

    attempt: Mapped[LessonAttempt] = relationship(back_populates="exercise_attempts")


class DailyActivity(Base):
    __tablename__ = "daily_activity"
    __table_args__ = (UniqueConstraint("user_id", "activity_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    activity_date: Mapped[date] = mapped_column(Date, index=True)
    xp_earned: Mapped[int] = mapped_column(default=0)
    lessons_completed: Mapped[int] = mapped_column(default=0)


class Achievement(Base):
    __tablename__ = "achievements"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True)
    title: Mapped[str] = mapped_column(String(60))
    description: Mapped[str] = mapped_column(String(160))
    icon: Mapped[str] = mapped_column(String(24))
    metric: Mapped[str] = mapped_column(String(24))  # xp_total | current_streak | lessons | skills | legendaries
    threshold: Mapped[int]


class UserAchievement(Base):
    __tablename__ = "user_achievements"
    __table_args__ = (UniqueConstraint("user_id", "achievement_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    achievement_id: Mapped[int] = mapped_column(
        ForeignKey("achievements.id", ondelete="CASCADE")
    )
    unlocked_at: Mapped[datetime] = mapped_column(DateTime)

    achievement: Mapped[Achievement] = relationship()

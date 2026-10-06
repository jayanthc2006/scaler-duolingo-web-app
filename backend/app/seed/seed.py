"""Deterministic database seeding. `today`/`now` are arguments so tests can pin the calendar."""
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.base import Base
from app.models import (
    Achievement,
    Course,
    DailyActivity,
    Exercise,
    Lesson,
    LessonAttempt,
    Skill,
    Unit,
    User,
    UserAchievement,
    UserSkillProgress,
    UserStats,
)
from app.seed import content

# The default learner starts having finished the first skill, on a 4 day streak that was last
# extended yesterday, so one lesson today visibly moves streak, XP, daily goal and leaderboard.
DEFAULT_DAILY_XP = [(4, 32, 0), (3, 28, 0), (2, 40, 1), (1, 24, 1)]  # (days ago, xp, lessons)


def seed_content(db: Session) -> None:
    course = Course(**content.COURSE)
    db.add(course)
    for u_pos, (title, desc, color, skills) in enumerate(content.UNITS, start=1):
        unit = Unit(position=u_pos, title=title, description=desc, color=color)
        course.units.append(unit)
        for s_pos, (s_title, icon, lessons) in enumerate(skills, start=1):
            skill = Skill(position=s_pos, title=s_title, icon=icon)
            unit.skills.append(skill)
            for l_pos, (l_title, exercises) in enumerate(lessons, start=1):
                lesson = Lesson(position=l_pos, title=l_title)
                skill.lessons.append(lesson)
                for e_pos, spec in enumerate(exercises, start=1):
                    lesson.exercises.append(Exercise(position=e_pos, **spec))
    for code, title, desc, icon, metric, threshold in content.ACHIEVEMENTS:
        db.add(Achievement(code=code, title=title, description=desc, icon=icon,
                           metric=metric, threshold=threshold))
    db.flush()


def _new_user(db: Session, username: str, name: str, color: str, now: datetime,
              settings: Settings, **stats: object) -> User:
    user = User(username=username, display_name=name, avatar_color=color,
                created_at=now - timedelta(days=30))
    user.stats = UserStats(hearts=settings.max_hearts, hearts_updated_at=now, **stats)  # type: ignore[arg-type]
    db.add(user)
    db.flush()
    return user


def seed_learners(db: Session, now: datetime, settings: Settings) -> None:
    today = now.date()
    xp_total = sum(xp for _, xp, _ in DEFAULT_DAILY_XP)
    alex = _new_user(
        db, settings.default_username, "Alex", "blue", now, settings,
        xp_total=xp_total, gems=450, current_streak=4, longest_streak=6,
        last_activity_date=today - timedelta(days=1), daily_goal_xp=30,
    )
    for days_ago, xp, lessons in DEFAULT_DAILY_XP:
        db.add(DailyActivity(user_id=alex.id, activity_date=today - timedelta(days=days_ago),
                             xp_earned=xp, lessons_completed=lessons))

    # Alex has already finished the first skill (Greetings): two completed lessons.
    first_skill = db.scalars(select(Skill).order_by(Skill.unit_id, Skill.position)).first()
    assert first_skill is not None
    for lesson in first_skill.lessons:
        db.add(LessonAttempt(
            user_id=alex.id, lesson_id=lesson.id, kind="lesson", status="completed",
            xp_awarded=10, gems_awarded=5, started_at=now - timedelta(days=1),
            completed_at=now - timedelta(days=1),
        ))
    db.add(UserSkillProgress(user_id=alex.id, skill_id=first_skill.id,
                             lessons_completed=len(first_skill.lessons),
                             completed_at=now - timedelta(days=1)))

    owned = {"first_lesson", "streak_3", "xp_100", "skill_1"}
    for ach in db.scalars(select(Achievement).where(Achievement.code.in_(owned))):
        db.add(UserAchievement(user_id=alex.id, achievement_id=ach.id,
                               unlocked_at=now - timedelta(days=1)))

    for name, color, weekly in content.RIVALS:
        rival = _new_user(db, name.lower().replace("í", "i"), name, color, now, settings,
                          xp_total=weekly + 300, gems=200, current_streak=2, longest_streak=9,
                          last_activity_date=today - timedelta(days=1), daily_goal_xp=30)
        shares = [(1, 0.4), (2, 0.35), (4, 0.25)]
        given = 0
        for i, (days_ago, share) in enumerate(shares):
            xp = weekly - given if i == len(shares) - 1 else round(weekly * share)
            given += xp
            db.add(DailyActivity(user_id=rival.id, activity_date=today - timedelta(days=days_ago),
                                 xp_earned=xp, lessons_completed=1))


def seed_database(db: Session, now: datetime, settings: Settings) -> None:
    """Idempotent: does nothing if a course already exists."""
    if db.scalar(select(Course.id).limit(1)) is not None:
        return
    seed_content(db)
    seed_learners(db, now, settings)
    db.commit()


def reset_database(db: Session, now: datetime, settings: Settings) -> None:
    """Drop everything and reseed. Destroys learner progress."""
    db.rollback()
    bind = db.get_bind()
    Base.metadata.drop_all(bind)
    Base.metadata.create_all(bind)
    seed_database(db, now, settings)

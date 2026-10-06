"""Lesson completion: verified server-side, applied in one transaction, safe to repeat."""
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.config import Settings
from app.core.errors import ConflictError, NotFoundError
from app.models import (
    ExerciseAttempt,
    Lesson,
    LessonAttempt,
    User,
    UserSkillProgress,
)
from app.schemas.learner import AchievementOut
from app.schemas.lesson import CompleteOut
from app.services import achievements, gamification
from app.services import learner as learner_service


def _answers_xp(db: Session, attempt_id: int) -> int:
    return db.scalar(
        select(func.coalesce(func.sum(ExerciseAttempt.xp_awarded), 0)).where(
            ExerciseAttempt.attempt_id == attempt_id, ExerciseAttempt.is_correct.is_(True)
        )
    ) or 0


def _verify_all_solved(db: Session, attempt: LessonAttempt, lesson: Lesson) -> None:
    required = {e.id for e in lesson.exercises}
    solved = set(
        db.scalars(
            select(ExerciseAttempt.exercise_id).where(
                ExerciseAttempt.attempt_id == attempt.id, ExerciseAttempt.is_correct.is_(True)
            )
        )
    )
    missing = required - solved
    if missing:
        raise ConflictError(
            f"{len(missing)} exercise(s) have not been answered correctly yet.",
            code="lesson_incomplete",
        )


def _bump_skill_progress(db: Session, user_id: int, lesson: Lesson, now: datetime) -> bool:
    """Returns True if this completion finished the skill."""
    progress = db.scalar(
        select(UserSkillProgress).where(
            UserSkillProgress.user_id == user_id, UserSkillProgress.skill_id == lesson.skill_id
        )
    )
    if progress is None:
        progress = UserSkillProgress(user_id=user_id, skill_id=lesson.skill_id, lessons_completed=0)
        db.add(progress)
    progress.lessons_completed = max(progress.lessons_completed, lesson.position)
    finished = progress.lessons_completed >= len(lesson.skill.lessons)
    if finished and progress.completed_at is None:
        progress.completed_at = now
    return finished


def _response(
    db: Session, user: User, attempt: LessonAttempt, lesson: Lesson, clock: Clock, settings: Settings,
    *, already: bool, new_achievements: list[AchievementOut], hearts_gained: int,
) -> CompleteOut:
    answers_xp = _answers_xp(db, attempt.id) if attempt.kind == "lesson" else 0
    progress = db.scalar(
        select(UserSkillProgress).where(
            UserSkillProgress.user_id == user.id, UserSkillProgress.skill_id == lesson.skill_id
        )
    )
    return CompleteOut(
        kind=attempt.kind,  # type: ignore[arg-type]
        already_completed=already,
        xp_from_answers=answers_xp,
        xp_completion_bonus=attempt.xp_awarded,
        xp_total_gained=answers_xp + attempt.xp_awarded,
        gems_awarded=attempt.gems_awarded,
        hearts_gained=hearts_gained,
        mistakes=attempt.mistakes,
        skill_id=lesson.skill_id,
        skill_completed=bool(progress and progress.completed_at),
        new_achievements=new_achievements,
        learner=learner_service.snapshot(db, user, clock, settings),
    )


def complete_attempt(
    db: Session, user: User, lesson_id: int, attempt_id: int, clock: Clock, settings: Settings
) -> CompleteOut:
    lesson = db.get(Lesson, lesson_id)
    if lesson is None:
        raise NotFoundError("Lesson not found.", code="lesson_not_found")
    attempt = db.get(LessonAttempt, attempt_id)
    if attempt is None or attempt.user_id != user.id or attempt.lesson_id != lesson_id:
        raise NotFoundError("Attempt not found.", code="attempt_not_found")

    if attempt.status == "completed":  # idempotent: replay the stored outcome, change nothing
        return _response(db, user, attempt, lesson, clock, settings,
                         already=True, new_achievements=[], hearts_gained=0)

    _verify_all_solved(db, attempt, lesson)

    now, today = clock.now(), clock.today()
    bonus = settings.xp_lesson_complete if attempt.kind == "lesson" else 0
    gems = settings.gems_per_lesson if attempt.kind == "lesson" else 0

    # Compare-and-set: exactly one concurrent request can flip in_progress -> completed.
    claimed = db.execute(
        update(LessonAttempt)
        .where(LessonAttempt.id == attempt.id, LessonAttempt.status == "in_progress")
        .values(status="completed", completed_at=now, xp_awarded=bonus, gems_awarded=gems)
    ).rowcount
    if claimed == 0:
        db.rollback()
        db.refresh(attempt)
        return _response(db, user, attempt, lesson, clock, settings,
                         already=True, new_achievements=[], hearts_gained=0)
    db.refresh(attempt)

    stats = user.stats
    gamification.sync_hearts(stats, now, settings)
    hearts_gained = 0
    new_achievements: list[AchievementOut] = []
    if attempt.kind == "practice":
        before = stats.hearts
        gamification.add_hearts(stats, settings.practice_hearts_reward, now, settings)
        hearts_gained = stats.hearts - before
    else:
        _bump_skill_progress(db, user.id, lesson, now)
        stats.gems += gems
        gamification.record_activity(db, stats, today, xp=bonus, lessons=1)
        db.flush()
        new_achievements = achievements.award_new(db, user, now)

    db.commit()
    return _response(db, user, attempt, lesson, clock, settings,
                     already=False, new_achievements=new_achievements, hearts_gained=hearts_gained)

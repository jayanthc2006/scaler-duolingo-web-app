"""Heart recovery actions: refill with gems, and starting a practice session."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.config import Settings
from app.core.errors import AppError, ConflictError
from app.db.session import begin_write
from app.models import Lesson, LessonAttempt, Skill, User
from app.schemas.learner import LearnerOut
from app.schemas.lesson import AttemptOut
from app.services import attempts, gamification
from app.services import learner as learner_service


def refill_hearts(db: Session, user: User, clock: Clock, settings: Settings) -> LearnerOut:
    begin_write(db)  # serialise read-decide-write (see db/session.py)
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


def start_practice(db: Session, user: User, clock: Clock, settings: Settings) -> AttemptOut:
    """Practice session: restores one heart on completion, never awards XP."""
    lesson_id = pick_practice_lesson(db, user)
    return attempts.start_attempt(db, user, lesson_id, "practice", clock, settings)

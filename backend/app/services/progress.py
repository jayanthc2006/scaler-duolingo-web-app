"""Learning-path state. The course is one linear sequence of lessons:

  a lesson is unlocked when every earlier lesson (across skills and units) is completed.

`user_skill_progress.lessons_completed` is the only stored progress; statuses are derived.
"""
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import NotFoundError
from app.models import Course, Lesson, Skill, Unit, UserSkillProgress
from app.schemas.course import (
    CourseOut,
    LessonStatus,
    LessonSummary,
    PathOut,
    SkillDetail,
    SkillNode,
    SkillStatus,
    UnitOut,
)


def completed_counts(db: Session, user_id: int) -> dict[int, int]:
    rows = db.execute(
        select(UserSkillProgress.skill_id, UserSkillProgress.lessons_completed).where(
            UserSkillProgress.user_id == user_id
        )
    )
    return {skill_id: n for skill_id, n in rows}


def skill_status(done: int, total: int, unlocked: bool) -> SkillStatus:
    if done >= total:
        return "completed"
    if not unlocked:
        return "locked"
    return "in_progress" if done > 0 else "available"


def lesson_status(lesson: Lesson, done: int, skill_unlocked: bool) -> LessonStatus:
    if lesson.position <= done:
        return "completed"
    if skill_unlocked and lesson.position == done + 1:
        return "available"
    return "locked"


@dataclass
class SkillState:
    skill: Skill
    unit: Unit
    done: int
    unlocked: bool

    @property
    def total(self) -> int:
        return len(self.skill.lessons)

    @property
    def status(self) -> SkillStatus:
        return skill_status(self.done, self.total, self.unlocked)


def _ordered_skill_states(db: Session, user_id: int, course: Course) -> list[SkillState]:
    counts = completed_counts(db, user_id)
    states: list[SkillState] = []
    previous_complete = True  # the first skill is always unlocked
    for unit in course.units:
        for skill in unit.skills:
            done = counts.get(skill.id, 0)
            state = SkillState(skill, unit, done, unlocked=previous_complete)
            states.append(state)
            previous_complete = state.status == "completed"
    return states


def _load_course(db: Session, course_id: int | None = None) -> Course:
    query = select(Course).options(
        selectinload(Course.units).selectinload(Unit.skills).selectinload(Skill.lessons)
    )
    query = query.where(Course.id == course_id) if course_id else query.order_by(Course.id)
    course = db.scalars(query).first()
    if course is None:
        raise NotFoundError("Course not found.", code="course_not_found")
    return course


def build_path(db: Session, user_id: int, course_id: int | None = None) -> PathOut:
    course = _load_course(db, course_id)
    states = _ordered_skill_states(db, user_id, course)
    current_id = next((s.skill.id for s in states if s.status in ("available", "in_progress")), None)
    by_unit: dict[int, list[SkillNode]] = {}
    for st in states:
        next_lesson = next(
            (x.id for x in st.skill.lessons if lesson_status(x, st.done, st.unlocked) == "available"),
            None,
        )
        by_unit.setdefault(st.unit.id, []).append(
            SkillNode(
                id=st.skill.id,
                title=st.skill.title,
                icon=st.skill.icon,
                position=st.skill.position,
                status=st.status,
                lessons_completed=min(st.done, st.total),
                lesson_count=st.total,
                next_lesson_id=next_lesson,
                is_current=st.skill.id == current_id,
            )
        )
    return PathOut(
        course=CourseOut.model_validate(course, from_attributes=True),
        units=[
            UnitOut(
                id=u.id,
                position=u.position,
                title=u.title,
                description=u.description,
                color=u.color,
                skills=by_unit.get(u.id, []),
            )
            for u in course.units
        ],
    )


def find_skill_state(db: Session, user_id: int, skill_id: int) -> SkillState:
    skill = db.get(Skill, skill_id)
    if skill is None:
        raise NotFoundError("Skill not found.", code="skill_not_found")
    course = _load_course(db, skill.unit.course_id)
    for state in _ordered_skill_states(db, user_id, course):
        if state.skill.id == skill_id:
            return state
    raise NotFoundError("Skill not found.", code="skill_not_found")


def skill_detail(db: Session, user_id: int, skill_id: int) -> SkillDetail:
    st = find_skill_state(db, user_id, skill_id)
    return SkillDetail(
        id=st.skill.id,
        title=st.skill.title,
        icon=st.skill.icon,
        unit_id=st.unit.id,
        unit_title=st.unit.title,
        status=st.status,
        lessons_completed=min(st.done, st.total),
        lessons=[
            LessonSummary(
                id=lesson.id,
                position=lesson.position,
                title=lesson.title,
                status=lesson_status(lesson, st.done, st.unlocked),
                exercise_count=len(lesson.exercises),
            )
            for lesson in st.skill.lessons
        ],
    )


def get_lesson_with_status(db: Session, user_id: int, lesson_id: int) -> tuple[Lesson, SkillState, LessonStatus]:
    lesson = db.get(Lesson, lesson_id)
    if lesson is None:
        raise NotFoundError("Lesson not found.", code="lesson_not_found")
    st = find_skill_state(db, user_id, lesson.skill_id)
    return lesson, st, lesson_status(lesson, st.done, st.unlocked)

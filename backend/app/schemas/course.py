from typing import Literal

from pydantic import BaseModel

SkillStatus = Literal["locked", "available", "in_progress", "completed"]
LessonStatus = Literal["locked", "available", "completed"]


class CourseOut(BaseModel):
    id: int
    code: str
    title: str
    language_name: str


class SkillNode(BaseModel):
    id: int
    title: str
    icon: str
    position: int
    status: SkillStatus
    lessons_completed: int
    lesson_count: int
    next_lesson_id: int | None  # first lesson not yet completed, if the skill is unlocked
    is_current: bool  # the node the learner should do next


class UnitOut(BaseModel):
    id: int
    position: int
    title: str
    description: str
    color: str
    skills: list[SkillNode]


class PathOut(BaseModel):
    course: CourseOut
    units: list[UnitOut]


class LessonSummary(BaseModel):
    id: int
    position: int
    title: str
    status: LessonStatus
    exercise_count: int


class SkillDetail(BaseModel):
    id: int
    title: str
    icon: str
    unit_id: int
    unit_title: str
    status: SkillStatus
    lessons_completed: int
    lessons: list[LessonSummary]


class LessonOut(BaseModel):
    id: int
    title: str
    position: int
    skill_id: int
    skill_title: str
    unit_title: str
    unit_color: str
    status: LessonStatus
    exercise_count: int

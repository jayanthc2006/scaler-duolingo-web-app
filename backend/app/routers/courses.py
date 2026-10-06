from fastapi import APIRouter
from sqlalchemy import select

from app.deps import DbDep, UserDep
from app.models import Course
from app.schemas.course import CourseOut, PathOut, SkillDetail, SkillNode, UnitOut
from app.services import progress

router = APIRouter(tags=["course"])


@router.get("/courses", response_model=list[CourseOut])
def list_courses(db: DbDep) -> list[Course]:
    return list(db.scalars(select(Course).order_by(Course.id)))


@router.get("/courses/{course_id}/path", response_model=PathOut)
def course_path(course_id: int, db: DbDep, user: UserDep) -> PathOut:
    """Units + skills with this learner's lock/progress state, in one round trip."""
    return progress.build_path(db, user.id, course_id)


@router.get("/units", response_model=list[UnitOut])
def list_units(db: DbDep, user: UserDep) -> list[UnitOut]:
    return progress.build_path(db, user.id).units


@router.get("/skills", response_model=list[SkillNode])
def list_skills(db: DbDep, user: UserDep) -> list[SkillNode]:
    return [s for u in progress.build_path(db, user.id).units for s in u.skills]


@router.get("/skills/{skill_id}", response_model=SkillDetail)
def get_skill(skill_id: int, db: DbDep, user: UserDep) -> SkillDetail:
    return progress.skill_detail(db, user.id, skill_id)

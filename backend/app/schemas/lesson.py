from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.learner import AchievementOut, LearnerOut
from app.services.evaluation import AnswerPayload

AttemptKind = Literal["lesson", "practice"]


class ExercisePublic(BaseModel):
    """What the client may see. Deliberately has no `answer` / `explanation` field."""

    id: int
    position: int
    type: str
    prompt: str
    payload: dict


class StartAttemptIn(BaseModel):
    kind: AttemptKind = "lesson"


class AttemptOut(BaseModel):
    attempt_id: int
    lesson_id: int
    lesson_title: str
    kind: AttemptKind
    exercises: list[ExercisePublic]
    solved_exercise_ids: list[int]  # makes the lesson resumable after a refresh
    learner: LearnerOut


class AnswerIn(BaseModel):
    attempt_id: int
    request_id: str = Field(min_length=8, max_length=64, description="client idempotency key")
    answer: AnswerPayload


class AnswerOut(BaseModel):
    correct: bool
    already_solved: bool = False
    xp_awarded: int
    heart_lost: bool
    out_of_hearts: bool
    correct_answer: str | None  # shown only after an incorrect answer
    explanation: str | None
    learner: LearnerOut


class PairCheckIn(BaseModel):
    left_id: str = Field(max_length=32)
    right_id: str = Field(max_length=32)


class PairCheckOut(BaseModel):
    match: bool


class CompleteIn(BaseModel):
    attempt_id: int


class CompleteOut(BaseModel):
    kind: AttemptKind
    already_completed: bool
    xp_from_answers: int
    xp_completion_bonus: int
    xp_total_gained: int
    gems_awarded: int
    hearts_gained: int
    mistakes: int
    skill_id: int
    skill_completed: bool
    new_achievements: list[AchievementOut]
    learner: LearnerOut

from datetime import date, datetime

from pydantic import BaseModel


class LearnerOut(BaseModel):
    """Everything the top bar / daily-goal widgets need. Returned by most mutating endpoints too,
    so the client never has to guess the new totals."""

    id: int
    username: str
    display_name: str
    avatar_color: str
    xp_total: int
    hearts: int
    max_hearts: int
    next_heart_in_seconds: int | None
    gems: int
    refill_cost_gems: int
    current_streak: int
    longest_streak: int
    streak_active_today: bool
    daily_goal_xp: int
    daily_xp: int


class AchievementOut(BaseModel):
    code: str
    title: str
    description: str
    icon: str
    unlocked: bool
    unlocked_at: datetime | None = None


class DayXp(BaseModel):
    date: date
    xp: int


class ProfileOut(BaseModel):
    learner: LearnerOut
    joined_at: datetime
    lessons_completed: int
    skills_completed: int
    total_skills: int
    total_lessons: int
    course_title: str
    week: list[DayXp]
    achievements: list[AchievementOut]


class LeaderboardRow(BaseModel):
    rank: int
    user_id: int
    display_name: str
    avatar_color: str
    xp: int
    is_current_user: bool


class LeaderboardOut(BaseModel):
    period_start: date
    period_end: date
    rows: list[LeaderboardRow]
    current_user: LeaderboardRow


class DailyGoalIn(BaseModel):
    daily_goal_xp: int

    model_config = {"json_schema_extra": {"examples": [{"daily_goal_xp": 30}]}}


class HeartsOut(BaseModel):
    learner: LearnerOut

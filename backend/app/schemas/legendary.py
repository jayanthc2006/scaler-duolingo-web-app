from pydantic import BaseModel


class LegendaryStatusOut(BaseModel):
    """What the entry card needs: is a challenge available, how long, what it pays."""

    available: bool
    remaining: int  # completed lessons not yet conquered
    conquered: int
    time_limit_seconds: int
    reward_xp: int
    reward_gems: int
    wrong_answer_penalty_seconds: int


class LegendaryEndOut(BaseModel):
    attempt_id: int
    status: str  # "abandoned" (just ended), or the terminal status it already had

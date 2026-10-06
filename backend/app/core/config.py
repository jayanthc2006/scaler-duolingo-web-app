"""Application settings. Every tunable game rule lives here so tests can override it."""
import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    return int(raw) if raw else default


@dataclass(frozen=True)
class Settings:
    database_url: str = field(
        default_factory=lambda: os.environ.get(
            "DATABASE_URL", f"sqlite:///{BACKEND_DIR / 'data' / 'app.db'}"
        )
    )
    cors_origins: tuple[str, ...] = field(
        default_factory=lambda: tuple(
            o.strip()
            for o in os.environ.get(
                "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
            ).split(",")
            if o.strip()
        )
    )
    default_username: str = field(
        default_factory=lambda: os.environ.get("DEFAULT_USERNAME", "alex")
    )

    auto_seed: bool = field(
        default_factory=lambda: os.environ.get("AUTO_SEED", "1") not in ("0", "false", "")
    )

    # --- gamification rules ---
    max_hearts: int = field(default_factory=lambda: _env_int("MAX_HEARTS", 5))
    heart_regen_seconds: int = field(
        default_factory=lambda: _env_int("HEART_REGEN_SECONDS", 1800)
    )
    refill_cost_gems: int = field(default_factory=lambda: _env_int("REFILL_COST_GEMS", 100))
    xp_per_correct_answer: int = field(default_factory=lambda: _env_int("XP_PER_CORRECT", 2))
    xp_lesson_complete: int = field(default_factory=lambda: _env_int("XP_LESSON_COMPLETE", 10))
    gems_per_lesson: int = field(default_factory=lambda: _env_int("GEMS_PER_LESSON", 5))
    practice_hearts_reward: int = 1

    # --- legendary (timed) challenge ---
    legendary_seconds: int = field(default_factory=lambda: _env_int("LEGENDARY_SECONDS", 60))
    # each wrong answer (or wrong match pair) takes this many seconds off the clock; the penalty is derived on the
    # server from the attempt's recorded wrong answers, so a refresh or a client cannot remove it
    legendary_wrong_answer_penalty_seconds: int = field(
        default_factory=lambda: _env_int("LEGENDARY_WRONG_ANSWER_PENALTY_SECONDS", 5)
    )
    legendary_grace_seconds: int = 3  # tolerance for network latency when the client submits the win
    legendary_xp: int = field(default_factory=lambda: _env_int("LEGENDARY_XP", 20))
    legendary_gems: int = field(default_factory=lambda: _env_int("LEGENDARY_GEMS", 10))


def get_settings() -> Settings:
    return Settings()

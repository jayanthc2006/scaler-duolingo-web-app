"""Streak / hearts rules as pure functions (no HTTP, no database)."""
from datetime import date, datetime, timedelta

from app.core.config import Settings
from app.models import UserStats
from app.services import gamification as g

SETTINGS = Settings(database_url="sqlite://", heart_regen_seconds=600)
TODAY = date(2026, 3, 10)
NOW = datetime(2026, 3, 10, 12, 0, 0)


def stats(**kw) -> UserStats:
    base = dict(user_id=1, xp_total=0, hearts=5, hearts_updated_at=NOW, gems=0,
                current_streak=0, longest_streak=0, last_activity_date=None, daily_goal_xp=30)
    return UserStats(**{**base, **kw})


# ---- streak
def test_first_activity_starts_streak():
    s = stats()
    assert g.apply_streak(s, TODAY) is True
    assert (s.current_streak, s.longest_streak, s.last_activity_date) == (1, 1, TODAY)


def test_activity_yesterday_increments():
    s = stats(current_streak=4, longest_streak=4, last_activity_date=TODAY - timedelta(days=1))
    g.apply_streak(s, TODAY)
    assert s.current_streak == 5 and s.longest_streak == 5


def test_repeated_same_day_activity_does_not_increment():
    s = stats(current_streak=4, longest_streak=4, last_activity_date=TODAY - timedelta(days=1))
    assert g.apply_streak(s, TODAY) is True
    assert g.apply_streak(s, TODAY) is False
    assert g.apply_streak(s, TODAY) is False
    assert s.current_streak == 5


def test_missed_day_resets_but_keeps_longest():
    s = stats(current_streak=6, longest_streak=9, last_activity_date=TODAY - timedelta(days=2))
    g.apply_streak(s, TODAY)
    assert s.current_streak == 1 and s.longest_streak == 9


def test_effective_streak_shows_zero_once_broken():
    s = stats(current_streak=6, longest_streak=6, last_activity_date=TODAY - timedelta(days=2))
    assert g.effective_streak(s, TODAY) == 0
    s.last_activity_date = TODAY - timedelta(days=1)
    assert g.effective_streak(s, TODAY) == 6


# ---- hearts
def test_hearts_regenerate_over_time_and_cap():
    s = stats(hearts=2, hearts_updated_at=NOW)
    g.sync_hearts(s, NOW + timedelta(seconds=599), SETTINGS)
    assert s.hearts == 2
    g.sync_hearts(s, NOW + timedelta(seconds=1250), SETTINGS)  # two intervals
    assert s.hearts == 4
    assert g.seconds_until_next_heart(s, NOW + timedelta(seconds=1250), SETTINGS) == 550
    g.sync_hearts(s, NOW + timedelta(days=3), SETTINGS)
    assert s.hearts == 5 and g.seconds_until_next_heart(s, NOW, SETTINGS) is None


def test_losing_heart_from_full_starts_regen_clock_now():
    s = stats(hearts=5, hearts_updated_at=NOW - timedelta(days=9))
    g.lose_heart(s, NOW, SETTINGS)
    g.sync_hearts(s, NOW, SETTINGS)
    assert s.hearts == 4  # old anchor must not instantly refund the heart


def test_cannot_lose_heart_at_zero():
    import pytest

    from app.core.errors import ConflictError

    with pytest.raises(ConflictError):
        g.lose_heart(stats(hearts=0), NOW, SETTINGS)

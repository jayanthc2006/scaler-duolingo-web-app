"""Injectable clock. All 'now' / 'today' reads go through here so date logic is testable.

Days are UTC calendar days (documented limitation: no per-user time zone).
"""
from datetime import date, datetime, timedelta, timezone


class Clock:
    def now(self) -> datetime:
        return datetime.now(timezone.utc).replace(tzinfo=None)  # naive UTC, matches SQLite

    def today(self) -> date:
        return self.now().date()


class FixedClock(Clock):
    """Test clock that can be moved forward explicitly."""

    def __init__(self, at: datetime):
        self._at = at

    def now(self) -> datetime:
        return self._at

    def advance(self, **kwargs: float) -> None:
        self._at += timedelta(**kwargs)


_clock: Clock = Clock()


def get_clock() -> Clock:
    return _clock

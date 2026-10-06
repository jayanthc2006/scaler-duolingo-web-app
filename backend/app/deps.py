from typing import Annotated

from fastapi import Depends, Path
from sqlalchemy.orm import Session

from app.core.clock import Clock, get_clock
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models import User
from app.services.learner import get_user_by_username

# Row ids are positive 64-bit ints (SQLite's range). Bounding them here turns absurd ids into a clean 422
# instead of an OverflowError inside the driver.
MAX_ID = 2**63 - 1
IdPath = Annotated[int, Path(ge=1, le=MAX_ID)]

DbDep = Annotated[Session, Depends(get_db)]
ClockDep = Annotated[Clock, Depends(get_clock)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_current_user(db: DbDep, settings: SettingsDep) -> User:
    """Auth is out of scope: the seeded default learner is always logged in."""
    return get_user_by_username(db, settings.default_username)


UserDep = Annotated[User, Depends(get_current_user)]

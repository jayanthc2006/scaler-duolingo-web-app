"""Usage:  python -m app.seed            (create tables + seed if empty)
          python -m app.seed --reset    (wipe everything and reseed)"""
import sys

import app.models  # noqa: F401  (registers tables)
from app.core.clock import get_clock
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.seed.seed import reset_database, seed_database


def main() -> None:
    settings, clock = get_settings(), get_clock()
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if "--reset" in sys.argv:
            reset_database(db, clock.now(), settings)
            print("Database reset and reseeded.")
        else:
            seed_database(db, clock.now(), settings)
            print("Database ready (seeded if it was empty).")


if __name__ == "__main__":
    main()

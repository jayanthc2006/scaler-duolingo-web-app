# Sprout - a Duolingo-style Spanish course

A full-stack, gamified language-learning app: a connected learning path, a shared lesson engine with five exercise
types, hearts / XP / streak / daily goal, profile, weekly leaderboard and settings. Built with **Next.js + TypeScript**
(frontend) and **FastAPI + SQLAlchemy + SQLite** (backend). The backend is the single source of truth for every
persistent number and for answer correctness.

> Original implementation. The public Duolingo product was used only as a UX reference; there is no copied code and no
> proprietary asset (the mascot, icons and path artwork are hand-written SVG/CSS).

* **Live demo:** _not deployed yet_ - see [Deployment](#deployment). No URL is claimed here.
* Docs: [Architecture](docs/ARCHITECTURE.md) · [Database](docs/DATABASE.md) · [API](docs/API.md) ·
  [Lesson engine](docs/LESSON_ENGINE.md) · [Decisions](docs/DECISIONS.md) · [Interview notes](docs/INTERVIEW_NOTES.md) ·
  [AI usage](AI_USAGE.md)

## Features

* **Learning path**: 3 units → 9 skills → 18 lessons; zig-zag path with locked / available / in-progress / completed
  states, progress rings, "START/CONTINUE" bubble, skill popover, sticky unit banners.
* **Lesson player**: one state machine + renderer; **multiple choice, translate (word bank), match pairs, fill in the blank,
  type the answer**; Check → green/red feedback bar with the correction → Continue; wrong answers are re-queued; keyboard
  support (Enter, number keys); resumable after refresh.
* **Gamification**: hearts (max 5, −1 per mistake, time-based regeneration, practice to earn one back, refill with gems),
  XP (+2 per correct answer, +10 per lesson), streak + longest streak, daily XP goal (configurable), mocked gems,
  achievements, toasts for confirmations, weekly leaderboard that updates as you play.
* **Backend authority**: answers are judged server-side, keys never sent to the client, completion is verified, all awards are
  idempotent and transactional.
* **Pages**: Learn, Leaderboard, Profile (stats, 7-day XP chart, achievements), Settings (daily goal is real; the rest are
  "Coming soon" placeholders).
* Responsive (desktop sidebar + right rail, tablet icon rail, phone bottom bar), reduced-motion aware, keyboard focus styles.

## Tech stack

| Layer | Tech |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, plain CSS, Vitest + Testing Library |
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2, Uvicorn, pytest, httpx (TestClient), ruff |
| Database | SQLite (WAL, foreign keys on) |

No UI kit, icon library, state library or animation library: see [DECISIONS D-13/D-14](docs/DECISIONS.md).

## Project structure

```
backend/
  app/            main.py, core/ (config, clock, errors), db/, models/, schemas/, services/, routers/, seed/
  tests/          60 + 2 concurrency tests (pytest)
  Dockerfile  requirements*.txt  pyproject.toml (ruff)  .env.example
frontend/
  app/            routes (learn, leaderboard, profile, settings, lesson/[lessonId])
  components/     layout, gamification, learning-path, lesson, exercises, modals, ui
  lib/            api client + types, lesson state machine, hooks, utils
  styles/         plain CSS (tokens, shell, path, lesson, pages)
docs/             architecture, database, API, lesson engine, decisions, interview notes
render.yaml       backend deployment blueprint (unverified)
```

## Database (summary - full detail in [docs/DATABASE.md](docs/DATABASE.md))

```
courses 1─* units 1─* skills 1─* lessons 1─* exercises            content (seeded, read-only)
users 1─1 user_stats
users 1─* user_skill_progress ─ skills
users 1─* lesson_attempts ─ lessons  1─* exercise_attempts ─ exercises
users 1─* daily_activity           users 1─* user_achievements *─1 achievements        learner state
```
Highlights: exercise `payload` (public) vs `answer` (private) columns; CHECK constraints on counters; three partial unique
indexes (one open attempt per lesson, one completed attempt per lesson, one solved answer per exercise per attempt);
leaderboard rank and skill status are derived, never stored.

## API overview (full list in [docs/API.md](docs/API.md))

```
GET  /api/health                      GET  /api/me            GET /api/me/stats    PATCH /api/me/daily-goal
GET  /api/courses                     GET  /api/courses/{id}/path                  GET /api/skills/{id}
GET  /api/units  /api/skills          GET  /api/lessons/{id}  GET /api/lessons/{id}/exercises
POST /api/lessons/{id}/attempts       POST /api/exercises/{id}/answer              POST /api/exercises/{id}/check-pair
POST /api/lessons/{id}/complete       POST /api/hearts/practice                    POST /api/hearts/refill
GET  /api/leaderboard
```
Errors share one envelope: `{"error": {"code": "...", "message": "..."}}`. Interactive docs at `http://127.0.0.1:8000/docs`.

## Setup

Prerequisites: Python 3.11+, Node 20+ (developed on Python 3.11 / Node 25, Windows).

### Backend

```bash
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate        macOS/Linux:  source .venv/bin/activate
pip install -r requirements-dev.txt
python -m app.seed                 # create tables + seed (idempotent). Add --reset to wipe and reseed
python -m uvicorn app.main:app --port 8000
```
The API also auto-seeds an empty database on startup (`AUTO_SEED=1`). Data lives in `backend/data/app.db`.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local         # NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
npm run dev                        # http://localhost:3000
```

> Windows tip: use `127.0.0.1` rather than `localhost` for the API URL - `localhost` tries IPv6 first and adds ~200 ms
> per request.

### Environment variables

| Variable | Where | Default | Meaning |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | frontend | `http://localhost:8000` | API base URL (build-time) |
| `DATABASE_URL` | backend | `sqlite:///backend/data/app.db` | SQLAlchemy URL |
| `CORS_ORIGINS` | backend | `http://localhost:3000,http://127.0.0.1:3000` | comma-separated allowed origins |
| `DEFAULT_USERNAME` | backend | `alex` | the always-logged-in learner |
| `AUTO_SEED` | backend | `1` | seed an empty DB on startup |
| `MAX_HEARTS`, `HEART_REGEN_SECONDS`, `REFILL_COST_GEMS`, `XP_PER_CORRECT`, `XP_LESSON_COMPLETE`, `GEMS_PER_LESSON` | backend | 5, 1800, 100, 2, 10, 5 | game rules (set `HEART_REGEN_SECONDS=10` to watch regeneration live) |

## Demo journey

1. Open `http://localhost:3000` → learner **Alex** (4-day streak, Greetings done) and the path appear.
2. Tap the green **Introductions** node → *Start*. Answer a question wrong: heart −1, red bar with the correction.
3. Finish the lesson: celebration screen (+XP, accuracy, gems, streak 5, daily goal progress).
4. **Continue** → the node now shows a progress ring (1/2); top bar, daily goal and leaderboard rank updated.
5. Refresh: everything persists. Tap a locked node: it explains why it can't start.
6. Lose all hearts: out-of-hearts modal → *Practice to earn a heart* or *Refill for 100 gems*.

Reset the demo at any time with `python -m app.seed --reset` (dates are relative to the moment you seed).

## Testing

```bash
cd backend && python -m pytest        # 62 tests
cd backend && python -m ruff check app tests
cd frontend && npm test               # 35 tests (Vitest)
cd frontend && npm run lint && npm run typecheck && npm run build
```

Backend coverage: health, validation and error shapes, answer evaluation per type, XP / hearts / regeneration, skill progress,
completion (incomplete rejected, bonus once, duplicate/parallel completion), request-id replay, solved-once, streak (today /
yesterday / repeated / missed day) with a fixed clock, daily activity, locked lessons, zero hearts, refill, practice,
leaderboard, profile, DB constraints and seed determinism, restart persistence, and **parallel** requests against a file DB.
Frontend: the lesson state machine, every exercise component, feedback bar, path geometry.

Results from the last run are listed in the project's final report (they are not asserted here to avoid going stale).

## Deployment

**Status: not deployed.** The repository contains templates, but no deployment was performed or verified.

* **Frontend → Vercel**: import the repo, set *Root Directory* to `frontend`, set `NEXT_PUBLIC_API_URL` to the API's public URL.
* **Backend → Render** (`render.yaml`, Docker): the blueprint mounts a **persistent disk** at `/data` and points
  `DATABASE_URL=sqlite:////data/app.db`; set `CORS_ORIGINS` to the Vercel origin. The app creates tables and seeds on first
  boot and never overwrites existing data.
* **Persistence caveat:** SQLite needs a durable filesystem. On hosts without a persistent disk (e.g. a free web service),
  the database file is **lost on restart/redeploy** and the demo resets to its seed state. A disk also pins the service to
  one instance. For multi-instance or free-tier hosting, switch `DATABASE_URL` to Postgres (SQLAlchemy models are portable;
  the partial unique indexes need Postgres syntax checks).
* Verify after deploying: `GET /api/health`, load the frontend, play a lesson, restart the service, confirm XP persisted.

## Design decisions (short)

Attempts as the unit of work; answer keys never leave the server; idempotency via request ids + partial unique indexes +
compare-and-set; derived leaderboard/skill status; lazy heart regeneration with an injected clock; no `POST /activity`
(streak can't be client-driven); match-pairs probe endpoint. Details and rejected alternatives: [docs/DECISIONS.md](docs/DECISIONS.md).

## Assumptions

* One default learner, no authentication or registration.
* Days are UTC calendar days.
* Course content is small and seeded (108 exercises); gems are mocked (earned per lesson, spent on heart refills).

## Known limitations

* SQLite = single writer node; no migrations (`create_all`).
* The `check-pair` endpoint can be brute-forced (documented trade-off, D-6).
* No audio/speaking exercises, no real time-zone handling, Settings other than daily goal are placeholders.
* Not verified in browsers other than Chromium; no screen-reader testing; no automated end-to-end suite.
* Not deployed (see above).

## AI-assisted development

Built with Claude Code in one agentic session: it wrote the code and tests, ran them, drove the UI in a browser and fixed
what it found. What was generated, how it was checked and what the AI got wrong is recorded in [AI_USAGE.md](AI_USAGE.md).

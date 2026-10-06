# Sprout - a Duolingo-style Spanish course

A full-stack, gamified language-learning app: a connected learning path, a shared lesson engine with five exercise
types, hearts / XP / streak / daily goal, profile, weekly leaderboard and settings. Built with **Next.js + TypeScript**
(frontend) and **FastAPI + SQLAlchemy + SQLite** (backend). The backend is the single source of truth for every
persistent number and for answer correctness.

> Original implementation. The public Duolingo product was used only as a UX reference; there is no copied code and no
> proprietary asset (the mascot, icons and path artwork are hand-written SVG/CSS).

* **Live demo:** _not deployed yet_ - see [Deployment](#deployment). No URL is claimed here.
* Docs: [Architecture](docs/ARCHITECTURE.md) · [Database](docs/DATABASE.md) · [API](docs/API.md) ·
  [Lesson engine](docs/LESSON_ENGINE.md) · [Decisions](docs/DECISIONS.md) · [Interview notes](docs/INTERVIEW_NOTES.md)

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
* **Pages**: Learn, Leaderboard, Legendary challenge, Profile (stats, 7-day XP chart, achievements), Settings (daily goal,
  theme and sound effects are real; the rest are "Coming soon" placeholders).
* Responsive (desktop sidebar + right rail, tablet icon rail, phone bottom bar), reduced-motion aware, keyboard focus styles.

### Bonus features (all six)

| Bonus | What it is |
| --- | --- |
| Exercise audio | A speaker button reads the Spanish with the browser's built-in text-to-speech (`SpeechSynthesis`, `es-ES`): on Spanish prompts (translate/type "Write this in English", "What does "X" mean?"), on tapping a Spanish tile in match-pairs, and after answering (the finished Spanish answer, from the feedback bar). Disabled with an explanation if the browser has no speech synthesis. No audio files, no service, no backend involvement, and it never touches grading. Separately, short synthesised feedback sounds (Web Audio, no asset files) play once per judged answer (correct / wrong, including a wrong match pair) and once when a lesson completes; Settings → Sound → *Sound effects* turns them off. |
| Achievements | 9 data-driven badges (metric + threshold rows), unlocked server-side on completion, shown on Profile (locked/unlocked) and as toasts / on the completion screen. `Legend` unlocks with the first Legendary win, so it can be demoed in one minute. |
| Real leaderboard | Weekly XP over 8 seeded rivals + the learner, **derived on every request** from `daily_activity`; earning XP (lesson, or a Legendary win) moves the learner's rank. |
| Legendary (timed) challenge | `/legendary`: redo a lesson you finished against a **60-second** clock. Reuses the lesson engine (same exercises, same answer endpoint, same `/complete`). The deadline is enforced by the server; a win pays **+20 XP and +10 gems once per lesson**; each wrong answer costs a fixed **5 seconds** (no hearts at risk); ending the session abandons the run, running out of time closes it, and a fresh *Start* / *Try again* always begins a new one while a refresh resumes the live one; failure/expiry costs nothing else. See [LESSON_ENGINE](docs/LESSON_ENGINE.md#legendary-challenge) and [D-20](docs/DECISIONS.md). |
| Dark mode | Settings → Theme: Light / Dark / Auto (default: follow the device). Implemented as design tokens under `<html data-scheme="dark">`, applied before first paint, persisted in `localStorage`. |
| Responsive | Desktop sidebar + right rail, tablet icon rail, phone bottom bar; checked at 360 / 375 / 430 / 768 / 1280 / 1440 px in both themes. |

## Tech stack

| Layer | Tech |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, plain CSS, Vitest + Testing Library |
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2, Uvicorn, pytest, httpx (TestClient), ruff |
| Database | SQLite (WAL, foreign keys on) |

No UI kit, icon library, state library or animation library: see [DECISIONS D-13/D-14](docs/DECISIONS.md).

## Architecture

```
Browser ─► Next.js frontend ─► FastAPI REST API ─► routers ─► services ─► SQLAlchemy models ─► SQLite
 (React)    (App Router, TS)     (/api/*, JSON)     (HTTP)    (rules)     (tables, queries)    (one file)
```

| Layer | Responsibility |
| --- | --- |
| Browser / Next.js frontend | Renders the UI (path, lesson player, profile, leaderboard, settings) and holds only UI state: the lesson state machine, the current draft answer, the theme. It never decides correctness, XP, hearts, streaks or progress; it sends what the learner did and displays what the server returns. |
| FastAPI REST API | JSON over HTTP under `/api`, request validation (Pydantic schemas), one shared error envelope, CORS for the frontend origin. |
| Routers (`app/routers`) | Thin: map a URL to one service call and a response schema. No business rules. |
| Services (`app/services`) | All rules: answer evaluation, hearts and regeneration, XP, streak, daily goal, skill unlocking, completion, achievements, leaderboard, Legendary. Time comes from an injected `Clock`; write paths take a write lock and are idempotent. |
| Models (`app/models`) | SQLAlchemy tables: course content (read-only at runtime) and learner state, with the constraints and indexes listed below. |
| SQLite | A single file (`backend/data/app.db`), WAL mode, foreign keys on. Seeded by `python -m app.seed`. |

**Example: answering a question.** The learner presses *Check* → the frontend sends `POST /api/exercises/{id}/answer` with
`{attempt_id, request_id, answer}` → the router calls `answers.submit_answer` → the service loads the exercise and the learner's
attempt, replays the stored result if that `request_id` was already seen, evaluates the answer against the private key,
then (for a real lesson) awards XP and updates daily activity and the streak if correct, or removes a heart if wrong, and commits
once → the response carries `correct`, the correction (only after a wrong answer) and a fresh `learner` snapshot → the frontend
shows the green or red feedback bar and updates the top bar from that snapshot. Finishing a lesson works the same way through
`POST /api/lessons/{id}/complete`, which the server re-verifies before applying any reward.
Full detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/LESSON_ENGINE.md](docs/LESSON_ENGINE.md).

## Project structure

```
backend/
  app/            main.py, core/ (config, clock, errors), db/, models/, schemas/, services/, routers/, seed/
  tests/          161 tests (pytest): API flows, hardening/break-tests, concurrency, DB constraints, seed, legendary, match-pair hearts
  Dockerfile  requirements*.txt  pyproject.toml (ruff)  .env.example
frontend/
  app/            routes (learn, leaderboard, legendary, profile, settings, lesson/[lessonId], legendary/play)
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
| Table | Purpose |
| --- | --- |
| `courses` | a language course (`code`, `title`, `language_name`); one is seeded (Spanish) |
| `units` | ordered sections of a course (`position`, `title`, `description`, `color`) |
| `skills` | ordered nodes of a unit, shown on the path (`position`, `title`, `icon`) |
| `lessons` | ordered lessons of a skill (`position`, `title`) |
| `exercises` | the five exercise types; public `payload` (what the client sees) and private `answer` (the key, never sent before grading) as JSON, plus `prompt` and `explanation` |
| `users` | learner identity (`username` unique, `display_name`, `avatar_color`); the seeded learner plus 8 leaderboard rivals |
| `user_stats` | 1:1 with `users`: XP, hearts and their regeneration anchor, gems, current/longest streak, last activity date, daily goal |
| `user_skill_progress` | lessons completed and completion time per (user, skill) |
| `lesson_attempts` | one run through a lesson: `kind` (`lesson` / `practice` / `legendary`), `status` (`in_progress` / `completed` / `failed` / `abandoned`), mistakes, awarded XP and gems, timestamps |
| `exercise_attempts` | every submitted answer: idempotency `request_id`, correctness, heart lost, XP awarded, the submitted answer |
| `daily_activity` | XP and lessons per (user, UTC day); drives the daily goal, the 7-day chart and the weekly leaderboard |
| `achievements` | badge definitions as data (`code`, `metric`, `threshold`): 9 seeded |
| `user_achievements` | which badges a learner unlocked, and when |

Highlights: exercise `payload` (public) vs `answer` (private) columns; CHECK constraints on counters; four partial unique
indexes (one open attempt per lesson, one completed attempt per lesson, one completed legendary reward per lesson, one solved
answer per exercise per attempt); a unique `(attempt_id, request_id)` pair for answer idempotency; leaderboard rank and skill
status are derived, never stored.

## API overview (full list in [docs/API.md](docs/API.md))

```
GET  /api/health                      GET  /api/me            GET /api/me/stats    PATCH /api/me/daily-goal
GET  /api/courses                     GET  /api/courses/{id}/path                  GET /api/skills/{id}
GET  /api/units  /api/skills          GET  /api/lessons/{id}  GET /api/lessons/{id}/exercises
POST /api/lessons/{id}/attempts       POST /api/exercises/{id}/answer              POST /api/exercises/{id}/check-pair
POST /api/lessons/{id}/complete       POST /api/hearts/practice                    POST /api/hearts/refill
GET  /api/leaderboard
GET  /api/legendary                   POST /api/legendary/start   POST /api/legendary/{attempt_id}/end
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
On Windows PowerShell, the equivalent of the `cp` line is `Copy-Item .env.example .env.local`.

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
| `LEGENDARY_SECONDS`, `LEGENDARY_XP`, `LEGENDARY_GEMS`, `LEGENDARY_WRONG_ANSWER_PENALTY_SECONDS` | backend | 60, 20, 10, 5 | legendary challenge clock, reward and per-wrong-answer time penalty |

## Demo journey

1. Open `http://localhost:3000` → learner **Alex** (4-day streak, Greetings done) and the path appear.
2. Tap the green **Introductions** node → *Start*. Answer a question wrong: heart −1, red bar with the correction.
3. Finish the lesson: celebration screen (+XP, accuracy, gems, streak 5, daily goal progress).
4. **Continue** → the node now shows a progress ring (1/2); top bar, daily goal and leaderboard rank updated.
5. Refresh: everything persists. Tap a locked node: it explains why it can't start.
6. Lose all hearts: out-of-hearts modal → *Practice to earn a heart* or *Refill for 100 gems*.
7. **Legendary** (sidebar star): *Start* → finish the exercises before the 60 s clock ends (each wrong answer costs 5 s) → +20 XP, +10 gems, the *Legend* badge, and a higher leaderboard rank. Let the clock run out to see the time's-up screen; *Try again* restarts it. Refresh mid-run to resume it; the X → *End session* abandons it, so *Start* begins a fresh run.
8. **Settings → Theme → Dark**; refresh: it persists. Tap the speaker button on a Spanish prompt, or after answering, to hear it.

Reset the demo at any time with `python -m app.seed --reset` (dates are relative to the moment you seed).

## Testing

```bash
cd backend && python -m pytest        # 161 tests
cd backend && python -m ruff check app tests
cd frontend && npm test               # 107 tests (Vitest)
cd frontend && npm run lint && npm run typecheck && npm run build
```

Backend coverage: health, validation and error shapes, answer evaluation per type, XP / hearts / regeneration, skill progress,
completion (incomplete rejected, bonus once, duplicate/parallel completion), request-id replay, solved-once, streak (today /
yesterday / repeated / missed day) with a fixed clock, daily activity, locked lessons, zero hearts, refill, practice,
leaderboard, profile, DB constraints and seed determinism, restart persistence, hostile/malformed input (oversized ids, forged fields, other learners' attempts, locked secondary endpoints), and **16-way parallel** requests against a file DB (answers, completion, refill).
Legendary: reward once per lesson, server-enforced deadline (late win rejected, grace window), resume with remaining time, retry gets a fresh clock, wrong-answer time penalty (server-derived, idempotent per request id, concurrent-safe), End Session is terminal and idempotent, no hearts/skill progress touched, replay is idempotent.
Frontend: the lesson state machine, every exercise component, feedback bar, path geometry, theme (incl. the pre-paint script), speech rules + the speak button (supported / unsupported), the deadline hook.

Run the commands above to see the current results; the test counts quoted in this README were accurate when it was last updated.

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
(streak can't be client-driven); per-pair server check in match-pairs (a wrong pair costs a heart). Details and rejected alternatives: [docs/DECISIONS.md](docs/DECISIONS.md).

## Assumptions

* One default learner, no authentication or registration.
* Days are UTC calendar days.
* Course content is small and seeded (108 exercises); gems are mocked (earned per lesson, spent on heart refills).

## Known limitations

* SQLite = single writer node; no migrations (`create_all`).
* Audio is the browser's text-to-speech (voice quality depends on the OS/browser; no recorded audio, no speech *recognition* / pronunciation scoring). No real time-zone handling; Settings other than daily goal, theme and sound effects are placeholders.
* The Legendary clock is server-authoritative but the UI countdown is client-side (a slow client sees the "time's up" screen at most a moment after the server would reject).
* Not verified in browsers other than Chromium; no screen-reader testing; no automated end-to-end suite.
* Not deployed (see above).

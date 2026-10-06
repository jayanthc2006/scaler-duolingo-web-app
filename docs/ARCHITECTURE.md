# Architecture

Sprout is a Duolingo-style Spanish course: a **Next.js** frontend talking JSON over HTTP to a **FastAPI**
backend that owns all state in **SQLite** (via SQLAlchemy). There is no authentication: a seeded
default learner (`alex`) is always "logged in".

```
 Browser (Next.js App Router, React 19, TypeScript)
   |  fetch JSON  (NEXT_PUBLIC_API_URL)
   v
 FastAPI app ── routers/      HTTP only: parse -> call a service -> return a schema
                 services/    ALL business rules (answers, hearts, XP, streak, completion, ...)
                 schemas/     Pydantic request/response models (the public contract)
                 models/      SQLAlchemy tables (content vs learner state)
                 seed/        deterministic course + demo learners
   |  SQLAlchemy
   v
 SQLite file (WAL mode, foreign keys ON)
```

## Principles

1. **The backend is the source of truth.** The browser never decides correctness, XP, hearts, streak,
   skill progress or lesson completion. It sends *what the learner did*; the server replies with *what happened*.
2. **Answer keys never leave the server** until after an answer (and then only the display text of the solution).
   `Exercise.payload` (public) and `Exercise.answer` (private) are separate columns; `ExercisePublic` has no
   field that could carry the key.
3. **One lesson engine.** One reducer (`lessonMachine.ts`), one renderer (`ExerciseRenderer`), five small
   exercise components that all implement the same `ExerciseViewProps` contract.
4. **Time is injected.** Services receive `Clock`/`Settings`; nothing calls `datetime.now()` directly, so streak
   and heart-regeneration logic is deterministic in tests.
5. **Idempotent writes.** Retries and double clicks must be harmless (see LESSON_ENGINE.md and DATABASE.md).

## Backend layout (`backend/app`)

| Path | Responsibility |
| --- | --- |
| `main.py` | `create_app()`: CORS, error handlers, routers under `/api`, lifespan creates tables + auto-seeds |
| `core/config.py` | `Settings` (env-driven): DB URL, CORS, all game-rule constants |
| `core/clock.py` | `Clock` + `FixedClock` for tests (UTC days) |
| `core/errors.py` | `AppError` hierarchy and the `{"error": {"code", "message"}}` response shape |
| `db/` | declarative `Base`, engine/session factory (FK pragma, WAL, busy timeout), `get_db` dependency |
| `models/content.py` | `Course → Unit → Skill → Lesson → Exercise` |
| `models/learner.py` | `User`, `UserStats`, `UserSkillProgress`, `LessonAttempt`, `ExerciseAttempt`, `DailyActivity`, `Achievement`, `UserAchievement` |
| `services/evaluation.py` | pure answer validation per exercise type (no DB) |
| `services/gamification.py` | pure-ish hearts / streak / XP-activity rules |
| `services/progress.py` | learning-path state: statuses and the unlock rule |
| `services/attempts.py` | start/resume an attempt, public exercise projection |
| `services/answers.py` | answer submission (idempotent), pair probe |
| `services/completion.py` | completion verification + atomic apply |
| `services/hearts.py` | refill with gems, start a practice session |
| `services/leaderboard.py` | weekly leaderboard, derived per request |
| `services/profile.py` | profile statistics, daily-goal setting |
| `services/achievements.py`, `learner.py` | achievements; learner snapshot (`snapshot` / `refresh` = snapshot + persist heart regeneration) |
| `routers/*` | thin HTTP layer: dependencies in, one service call, schema out (enforced by `tests/test_architecture.py`) |
| `seed/` | `builders.py` (exercise constructors), `content.py` (the course as data), `seed.py`, `__main__.py` (CLI) |

**Transaction boundary:** each service operation performs its reads, mutations and a *single* `db.commit()`. Mutating services take the SQLite write lock first (`begin_write` → `BEGIN IMMEDIATE`) so the read-decide-write sequence cannot interleave with another request.
`get_db` rolls back on any escaping exception, so a failed request never leaves half-applied state.

## Frontend layout (`frontend`)

```
app/
  layout.tsx                  root: font, global CSS, <LearnerProvider>
  (main)/layout.tsx           AppShell: sidebar + top status bar + right rail
  (main)/page.tsx             Learn (learning path)
  (main)/{leaderboard,profile,settings}/page.tsx
  lesson/[lessonId]/page.tsx  full-screen lesson (outside the shell)
  (main)/legendary/page.tsx   Legendary hub (rules, availability, Start)
  legendary/play/page.tsx     full-screen timed run (same LessonScreen, kind="legendary")
components/
  layout/        AppShell, Navigation (sidebar / icon rail / bottom bar), TopBar
  gamification/  StatusPills (streak, XP, gems, hearts+timer), DailyGoalCard, LeaderboardRow, LeaguePreview
  learning-path/ LearningPath, UnitSection, SkillNode, ProgressRing, SkillPopover
  lesson/        LessonScreen, LessonHeader, FeedbackBar, LessonComplete
  exercises/     ExerciseRenderer + MultipleChoice / Translate(+WordBank) / MatchPairs / FillBlank / TypeAnswer
  modals/        OutOfHeartsModal, QuitLessonModal, TimesUpModal
  ui/            Button, Icon (original SVG set), Mascot, ProgressBar, Modal, Avatar, StateBox, SpeakButton
lib/
  api/           client.ts (fetch wrapper, ApiError), endpoints.ts (typed calls)
  types/api.ts   TypeScript mirror of the backend schemas
  lesson/        lessonMachine.ts (pure reducer), useLessonSession.ts (I/O wiring)
  learner/       LearnerContext (shared hearts/XP/streak snapshot)
  hooks/         useAsync, useCountdown, useDeadline (legendary clock)
  audio/         speech.ts (browser text-to-speech), speakable.ts (what each exercise can read aloud)
  theme/         theme.ts (Light / Dark / Auto store + pre-paint script)
  utils/         pathLayout.ts (zig-zag geometry), format.ts
styles/          base (tokens), ui, shell, path, lesson, pages  (plain CSS, no framework)
```

Data flow for the learner snapshot: every mutating endpoint returns a fresh `learner` object
(hearts, XP, streak, gems, daily progress). The client pushes it into `LearnerContext`, so the top bar
updates instantly with server-computed numbers instead of client-side arithmetic.

## Learning path rule

The course is one linear sequence of lessons. A lesson is unlocked when every earlier lesson is complete.
`user_skill_progress.lessons_completed` is the only stored progress; skill status
(`locked | available | in_progress | completed`) and lesson status are *derived* in `services/progress.py`.

## Request flow: answering a question

```
FeedbackBar "Check" ─► useLessonSession.submit()
   POST /api/exercises/{id}/answer {attempt_id, request_id, answer}
        │ answers.submit_answer():
        │   load exercise + attempt (ownership, same lesson, still open)
        │   replay if request_id already seen            ─► stored result, no side effects
        │   no-op if exercise already solved in attempt
        │   hearts regen sync; reject if 0 hearts (lesson attempts)
        │   evaluation.evaluate()  (422 if malformed, before any mutation)
        │   correct:  +XP, daily_activity, streak       wrong: -1 heart, mistakes+1
        │   insert exercise_attempt; ONE commit
        ▼
   {correct, xp_awarded, heart_lost, out_of_hearts, correct_answer?, learner}
```

## Deployment shape

* Frontend: static/SSR Next.js app (Vercel), configured only by `NEXT_PUBLIC_API_URL`.
* Backend: one container (`backend/Dockerfile`), one SQLite file on a **persistent disk**
  (`DATABASE_URL=sqlite:////data/app.db`), `CORS_ORIGINS` = the frontend origin. See README → Deployment.

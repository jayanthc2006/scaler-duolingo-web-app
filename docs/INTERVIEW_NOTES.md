# Interview notes

A map of the system you should be able to explain without looking at the code. Each subsystem lists: **what / why /
data flow / design chosen / alternatives / failure modes / persistence**. Code pointers are in `backticks`.

## 30-second pitch
"Sprout is a Duolingo-style Spanish course. Next.js frontend, FastAPI backend, SQLite. The backend is the single source of
truth: it holds the course as data, judges every answer, and applies XP, hearts, streak and skill progress inside
transactions. The lesson player is one state machine plus a renderer that picks one of five exercise components. Duplicate
requests are safe because of idempotency keys, atomic compare-and-set, and partial unique indexes."

---
## 1. Architecture
* **What:** routers → services → SQLAlchemy models → SQLite; Next.js client talks JSON.
* **Why:** routers stay thin, rules live in services and are unit-testable; time/config are injected.
* **Data flow:** see ARCHITECTURE.md "answering a question".
* **Alternatives:** Next.js server actions/route handlers talking to the DB directly (rejected: the assignment fixes FastAPI;
  separate API also scales/tests independently).
* **Failure modes:** API down → every page shows `ErrorState` with *Try again*; lesson submit network failure → footer notice
  and the same `request_id` is reused on retry.

## 2. Database schema
* Content (`courses→units→skills→lessons→exercises`) vs learner state (`user_stats`, `user_skill_progress`,
  `lesson_attempts`, `exercise_attempts`, `daily_activity`, `achievements`).
* **Why `user_stats` is separate from `users`:** hot counters, 1:1, keeps identity stable. **Why JSON for exercise
  `payload/answer`:** per-type shapes differ; relational state elsewhere stays in columns.
* **Constraints to mention:** CHECKs (no negative hearts/gems/XP, `longest ≥ current`), FK pragma ON, three *partial unique
  indexes* (open attempt, completed lesson, solved exercise).
* **Alternatives:** an `exercise_options` table (normalised, but the options are never queried independently - YAGNI);
  storing rank (stale-prone).
* **Persistence:** WAL file; seed is idempotent and never overwrites.

## 3. API design
* Resource-ish paths under `/api`, Pydantic in/out, one error envelope, meaningful statuses (403 locked, 409 state
  conflicts, 402 not enough gems, 422 validation).
* **Deviations** (and why): no `/activity`, added `/attempts`, `/check-pair`, `/path`, `/daily-goal` - API.md.
* **Be ready for:** "why POST for `/attempts` if it can return an existing one?" → it creates-or-resumes (idempotent create).

## 4. Frontend architecture
* App Router; `(main)` group = shell, `lesson/[lessonId]` is deliberately outside the shell (distraction-free, own layout).
* State: server data via `useAsync`; learner snapshot via `LearnerContext` (updated from every mutating response);
  lesson state via a reducer. No state library - see D-15.
* Styling: tokens in `base.css`, per-area CSS files; unit colour via `data-theme` + CSS variables.
* **Alternatives:** React Query (nice caching, but not needed at this size), Tailwind (extra dependency).

## 5. Lesson engine and ExerciseRenderer
See LESSON_ENGINE.md. Core points: pure reducer with a discriminated-union `Phase`; `ExerciseRenderer` is the only switch on
type; all exercise components share `ExerciseViewProps`; the I/O lives in one hook.
* **Failure modes:** out-of-hearts mid-lesson and at start; network failure on check; failure on completion (retry is safe).

## 6. State machine
`loading → question → checking → feedback → (question | out_of_hearts | completing → complete)`, plus `error`. Why a
union instead of booleans: impossible states (e.g. "checking and complete") can't be represented; the reducer ignores
events that are invalid for the phase. 13 unit tests.

## 7. Answer validation
Server-only, per type, in `services/evaluation.py` (pure functions, easily tested). Normalisation rules in API.md.
* **Why the key is hidden:** the browser is untrusted; devtools shows the whole network response.
* **Design point to volunteer:** `check-pair` is attempt-scoped and charges a heart per wrong pair, so it is not a free oracle (D-6).

## 8. XP logic
Correct answer in a real lesson: +2 (once per exercise per attempt); completion bonus +10; practice: 0. Rules are `Settings`
constants. All XP flows through `record_activity` so total XP, daily XP and streak can't diverge.

## 9. Heart logic
Wrong answer −1; 0 hearts blocks answering and starting lessons; lazy regeneration (+1 / 30 min, configurable); refill costs 100
gems; practice restores 1. The subtle bug avoided: when a heart is lost from *full*, reset the regen anchor to *now* (else the
heart would instantly regenerate from an old timestamp) - `test_losing_heart_from_full_starts_regen_clock_now`.

## 10. Streak logic
`apply_streak(stats, today)`: same day no-op; yesterday +1; else reset to 1; track longest. Display uses `effective_streak` so a
broken streak shows 0 immediately. Date source is an injected `Clock` → tests move time with `FixedClock.advance`.
UTC-day limitation (D-11).

## 11. Daily goal
Stored target (`daily_goal_xp`, changeable in Settings); progress = today's `daily_activity.xp_earned`. No reset job - a new
day simply has no row yet.

## 12. Persistence
Everything important is in SQLite; the only browser storage is a harmless `sessionStorage` hint for the unlock animation.
Verified: state identical after a backend process restart and after a browser refresh; mid-lesson refresh resumes.

## 13. Transactions and 14. Idempotency / duplicate protection
* One commit per service call; rollback on exception (`get_db`).
* Layers: (1) service checks → friendly responses; (2) `request_id` replay; (3) compare-and-set on completion; (4) partial
  unique indexes. Say it as "belt and braces: the app handles the normal case, the database guarantees the invariant".
* `tests/test_concurrency.py` (16 parallel requests, file DB): identical completions → exactly one winner; identical answers →
  one heart lost; *distinct* wrong answers → exactly 5 hearts lost; parallel correct answers → no lost XP; parallel refills → gems
  charged once. **Story worth telling:** an earlier version passed with 8 workers but failed with 16 - every parallel wrong answer
  read "hearts > 0" and wrote back (lost update), so a learner could dodge heart loss. Fix: `BEGIN IMMEDIATE` before the
  read-decide-write (`begin_write`), found by raising the worker count rather than trusting a green run.
  Mutation check: removing the guard makes the test fail (8 "winners").
* **Partial failure:** nothing is applied unless the single commit succeeds.

## 15. Error handling
`AppError` subclasses carry `code` + status; handlers convert them, `RequestValidationError` and Starlette HTTP errors into the
same envelope. The frontend `ApiError` exposes `code` (e.g. `out_of_hearts` drives UI state).

## 15b. Bonus features (added after the core was frozen)
* **Legendary**: reuse, don't fork. One new attempt kind, own start endpoint, server-side deadline in `complete_attempt`, reward once per
  lesson. Likely questions: *how do you stop reward farming?* (once per lesson, partial unique index, closed/failed attempts can't complete,
  replay is idempotent); *why not trust the client timer?* (it is display only; the server compares `started_at` with its injected clock +
  3 s grace); *why no hearts?* (a wrong answer costs a fixed 5 s instead; the penalty is derived from the attempt's recorded wrong answers, so it is idempotent per request id and cannot be dodged by refreshing); *what does End Session do?* (it abandons the attempt on the server, a terminal status, so Start creates a new one; a refresh resumes the live one).
* **Dark mode**: tokens, not an inversion filter; accents get separate text variants; pre-paint script avoids the flash; `data-scheme` vs
  the existing `data-theme` unit colours.
* **Audio**: `SpeechSynthesis`; speak what is asked about before answering, and the finished answer only after the server has graded it.
* **Achievements / leaderboard**: already data-driven / derived; the only addition is a `Legend` badge so the system can be demoed fast.

## 16. Trade-offs and limitations (be upfront)
SQLite single writer; no auth (one default learner); UTC days; no migrations; one course;
audio is browser TTS only (no speech recognition); leaderboard is weekly-XP over seeded rivals; Settings are placeholders except the daily goal, theme and sound effects;
deployment: Render Free frontend + backend; SQLite persistence is subject to the free-tier ephemeral filesystem.

## 17. What changes at production scale
Postgres + Alembic; real auth (sessions/OAuth) and per-user rows from `request.user`; per-user time zones; rate limiting on
answer/probe endpoints; Redis or materialised weekly leaderboards; background jobs for streak freezes/notifications; CDN +
caching of the (immutable) course content; observability (structured logs, metrics, tracing); idempotency-key expiry/cleanup;
content CMS with versioning (exercises referenced by attempts must stay immutable).

## Likely questions - quick answers
* *Why can't the client cheat XP?* It never sends XP; the server computes it from judged answers, once per exercise per attempt.
* *What if the user double-clicks Check?* Phase moves to `checking` (button disabled); even if two requests escape, same
  `request_id` → replay; different ids → `already_solved`/unique index.
* *What if complete is called twice / in parallel?* The write lock serialises them and the CAS lets one winner apply; the rest return the stored result.
* *How do you test time?* Inject `Clock`; `FixedClock.advance(days=1)`.
* *Why is the leaderboard weekly?* Matches the product, and lets rank change visibly; derived from `daily_activity`.
* *Why SQLite?* Required by the brief; fine for one node; Postgres for scale.
* *How would you add a new exercise type?* Seed builder + `evaluate` case + one frontend component + one `ExerciseRenderer` case.

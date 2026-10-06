# Database

SQLite via SQLAlchemy 2.x. Tables are created by `Base.metadata.create_all` (no migrations: see
DECISIONS.md D-9). Connection pragmas (`app/db/session.py`): `foreign_keys=ON` (SQLite ignores FKs
otherwise), `busy_timeout=5000`, `journal_mode=WAL` for file databases.

Content (read-only at runtime) is kept strictly separate from learner state.

## Entity relationships

```
courses 1─* units 1─* skills 1─* lessons 1─* exercises            (CONTENT)
                         │         │              │
                         │         │              └────────────┐
users 1─1 user_stats     │         └──────────────┐             │
  │                      │                        │             │
  ├─* user_skill_progress ─ skill_id ─────────────┘ (FK→skills) │
  ├─* lesson_attempts ───── lesson_id ───────────── (FK→lessons)│
  │        1                                                    │
  │        └─* exercise_attempts ── exercise_id ──────────────── (FK→exercises)
  ├─* daily_activity
  └─* user_achievements *─1 achievements                              (LEARNER STATE)
```

## Tables

### Content

| Table | Key columns | Constraints |
| --- | --- | --- |
| `courses` | `code` (e.g. `es`), `title`, `language_name` | `code` unique |
| `units` | `course_id`, `position`, `title`, `description`, `color` | UNIQUE(`course_id`,`position`); FK cascade |
| `skills` | `unit_id`, `position`, `title`, `icon` | UNIQUE(`unit_id`,`position`); FK cascade |
| `lessons` | `skill_id`, `position`, `title` | UNIQUE(`skill_id`,`position`); FK cascade |
| `exercises` | `lesson_id`, `position`, `type`, `prompt`, **`payload` JSON**, **`answer` JSON**, `explanation` | UNIQUE(`lesson_id`,`position`) |

`payload` is the *public* rendering data; `answer` is the *private* key. Shapes per type are documented in
`app/services/evaluation.py`. JSON is used only for these per-type blobs: all relational state is columns.

### Learner state

| Table | Purpose | Notable constraints |
| --- | --- | --- |
| `users` | learner identity (`username` unique, `display_name`, `avatar_color`) | |
| `user_stats` | 1:1 counters: `xp_total`, `hearts`, `hearts_updated_at` (regen anchor), `gems`, `current_streak`, `longest_streak`, `last_activity_date`, `daily_goal_xp` | CHECK hearts ≥ 0, gems ≥ 0, xp ≥ 0, `longest_streak ≥ current_streak ≥ 0` |
| `user_skill_progress` | `lessons_completed`, `completed_at` per (user, skill) | UNIQUE(`user_id`,`skill_id`); CHECK ≥ 0 |
| `lesson_attempts` | one run through a lesson: `kind` (`lesson`/`practice`/`legendary`), `status` (`in_progress`/`completed`/`failed`), `mistakes`, `xp_awarded` (completion bonus), `gems_awarded`, timestamps | partial unique indexes (below) |
| `exercise_attempts` | every submitted answer: `request_id`, `is_correct`, `heart_lost`, `xp_awarded`, `submitted_answer` JSON | UNIQUE(`attempt_id`,`request_id`); partial unique index (below) |
| `daily_activity` | XP and lessons per (user, UTC date) | UNIQUE(`user_id`,`activity_date`) |
| `achievements` | data-driven badges: `code`, `metric`, `threshold` | `code` unique |
| `user_achievements` | which badges a user unlocked, with time | UNIQUE(`user_id`,`achievement_id`) |

Child tables of `users` use `ON DELETE CASCADE`; `lesson_attempts.lesson_id` and
`exercise_attempts.exercise_id` deliberately do **not** cascade, so deleting content cannot silently erase history.

## Indexes and why

| Index | Why |
| --- | --- |
| `uq_attempt_open` UNIQUE(`user_id`,`lesson_id`,`kind`) **WHERE status='in_progress'** | at most one open attempt per lesson → "start" is resumable and cannot duplicate; also serves lookup of the open attempt |
| `uq_attempt_completed_lesson` UNIQUE(`user_id`,`lesson_id`) **WHERE kind='lesson' AND status='completed'** | a lesson can be completed exactly once per learner (DB-level backstop against double XP) |
| `uq_attempt_completed_legendary` UNIQUE(`user_id`,`lesson_id`) **WHERE kind='legendary' AND status='completed'** | a legendary reward is paid at most once per lesson (the service checks first; this is the backstop) |
| `uq_exercise_solved` UNIQUE(`attempt_id`,`exercise_id`) **WHERE is_correct=1** | an exercise is solved at most once per attempt → per-answer XP cannot be double-awarded even under a race |
| `ix_exercise_attempts_attempt_id` | completion check and resume read all answers of an attempt |
| `ix_lesson_attempts_user_id` | profile counts / practice-lesson pick |
| `ix_daily_activity_activity_date` | weekly leaderboard scans a date range across all users |
| UNIQUE constraints on `(parent, position)` | ordered children; their indexes also serve `parent_id` lookups |

The partial indexes are the "last line of defence": the service code checks first and returns friendly
errors; the constraints guarantee consistency even if two requests interleave.

## Derived data (deliberately not stored)

* **Leaderboard rank**: computed per request from `daily_activity` (sum of the last 7 UTC days) joined to `users`.
  Nothing to keep in sync; ties break on name then id.
* **Skill / lesson status**: derived from `user_skill_progress.lessons_completed` and the linear unlock rule.
* **Displayed streak**: `effective_streak()` shows 0 when `last_activity_date` is older than yesterday, even
  before the next activity formally resets the stored value.
* **Current hearts**: regenerated lazily from `hearts_updated_at` whenever the learner is read.

## Seed data (`python -m app.seed`)

Deterministic (shuffles are seeded from the prompt text; the learner's dates are relative to "now"):

* 1 course (Spanish), 3 units, 9 skills, 18 lessons, 108 exercises (6 per lesson, every type in every lesson)
* learner `alex`: 124 XP, 450 gems, 5 hearts, 4-day streak last extended *yesterday*, Greetings completed
* 8 rival learners with weekly XP spread over three days
* 9 achievements (4 already unlocked by `alex`); the 9th, `legendary_1`, unlocks with the first Legendary win

`python -m app.seed` is idempotent (no-op if a course exists); `--reset` drops everything and reseeds.

## Transactions and failure modes

* Each service call = reads → mutations → **one** commit; exceptions roll back (`get_db`).
* Completion uses a compare-and-set `UPDATE lesson_attempts SET status='completed' ... WHERE status='in_progress'`;
  only the request whose `rowcount == 1` applies XP/progress/streak. Others replay the stored result.
* **Write lock before read-decide-write.** The mutating services (`answers.submit_answer`, `completion.complete_attempt`,
  `hearts.refill_hearts`, `attempts.start_attempt`) first call `db.session.begin_write()`, which issues `BEGIN IMMEDIATE`.
  Without it two requests could read the same hearts/XP and both write back (a lost update: parallel wrong answers each
  saw "hearts > 0"). Waiters queue for up to `busy_timeout`; the lock is released when the request's session ends.
* `tests/test_concurrency.py` fires 16 parallel requests at a file-backed DB: identical completions, identical answers,
  *distinct* wrong answers (exactly 5 hearts lost, never fewer), parallel correct answers (no lost XP) and parallel refills
  (gems charged once).
* Limitation: SQLite means a single writer node. Scaling out needs Postgres (see INTERVIEW_NOTES.md).

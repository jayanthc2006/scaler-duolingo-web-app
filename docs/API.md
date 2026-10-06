# API

Base URL: `http://127.0.0.1:8000` · all routes are under `/api` · JSON in/out · interactive docs at `/docs`.
The current learner is the seeded default user (no auth).

## Errors

Every error uses one shape (including validation and unknown routes):

```json
{ "error": { "code": "out_of_hearts", "message": "You are out of hearts." } }
```
`422 validation_error` additionally carries `details: [{loc, msg}]`.

| Status | Codes |
| --- | --- |
| 403 | `lesson_locked` |
| 404 | `lesson_not_found`, `skill_not_found`, `exercise_not_found`, `attempt_not_found`, `course_not_found`, `user_not_found` |
| 409 | `out_of_hearts`, `lesson_already_completed`, `lesson_incomplete`, `attempt_closed`, `exercise_not_in_attempt`, `request_id_reuse`, `hearts_full`, `wrong_exercise_type`, `lesson_empty` |
| 402 | `insufficient_gems` |
| 422 | `validation_error`, `invalid_answer`, `invalid_daily_goal` |

## Endpoints

### Health and learner
| Method & path | Description |
| --- | --- |
| `GET /api/health` | liveness + DB check → `{"status":"ok","database":"ok"}` |
| `GET /api/me` | **Learner snapshot**: XP, hearts (+`next_heart_in_seconds`), gems, streak, longest streak, `streak_active_today`, daily goal and `daily_xp` |
| `GET /api/me/stats` | profile: snapshot + lessons/skills completed, 7-day XP, achievements (locked and unlocked) |
| `PATCH /api/me/daily-goal` `{daily_goal_xp}` | one of 10 / 20 / 30 / 50, else `422 invalid_daily_goal` |

### Course
| Method & path | Description |
| --- | --- |
| `GET /api/courses` | list courses |
| `GET /api/courses/{id}/path` | units → skills with `status`, `lessons_completed`, `lesson_count`, `next_lesson_id`, `is_current` (the learner's state, derived server-side) |
| `GET /api/units`, `GET /api/skills` | same data flattened (default course) |
| `GET /api/skills/{id}` | skill detail with its lessons and each lesson's status |
| `GET /api/lessons/{id}` | lesson metadata + status (`locked`/`available`/`completed`) |
| `GET /api/lessons/{id}/exercises` | public exercises (no answer data); `403` if locked |

### Lesson loop
| Method & path | Description |
| --- | --- |
| `POST /api/lessons/{id}/attempts` `{kind: "lesson"\|"practice"}` | start **or resume** the open attempt → `{attempt_id, exercises, solved_exercise_ids, learner}`. `403 lesson_locked`, `409 lesson_already_completed` / `out_of_hearts` (lesson kind) |
| `POST /api/exercises/{id}/answer` `{attempt_id, request_id, answer}` | judge one answer (below) |
| `POST /api/exercises/{id}/check-pair` `{left_id, right_id}` | side-effect-free probe used by match-pairs → `{match}`; `403 lesson_locked` for locked lessons |
| `POST /api/lessons/{id}/complete` `{attempt_id}` | verify + apply completion (below) |

**Answer bodies** (exactly one field is read, by exercise type):

| Type | `answer` |
| --- | --- |
| `multiple_choice` | `{"option_id": "b"}` |
| `translate` | `{"tokens": ["Yo","soy","Ana"]}` |
| `match_pairs` | `{"pairs": [{"left_id":"l0","right_id":"r2"}, ...]}` |
| `fill_blank`, `type_answer` | `{"text": "soy"}` |

Text comparison ignores case, surrounding/duplicate whitespace, `¿?¡!.,;:` and the accents on `áéíóúü` (but **not** `ñ`).

**Answer response**
```json
{ "correct": false, "already_solved": false, "xp_awarded": 0, "heart_lost": true, "out_of_hearts": false,
  "correct_answer": "Me llamo Ana", "explanation": null, "learner": { ... } }
```
`correct_answer` is only present after an *incorrect* answer. Re-sending the same `request_id` returns the stored
result and changes nothing; answering an already-solved exercise returns `already_solved: true` with 0 XP.

**Complete response** (`CompleteOut`): `xp_from_answers`, `xp_completion_bonus`, `xp_total_gained`, `gems_awarded`,
`hearts_gained` (practice), `mistakes`, `skill_completed`, `new_achievements[]`, `learner`, and
`already_completed` (true when the call was a repeat → nothing was applied again). `409 lesson_incomplete` if any
exercise of the lesson has no correct answer in this attempt.

### Hearts
| Method & path | Description |
| --- | --- |
| `POST /api/hearts/practice` | start a practice attempt (most recently completed lesson, else the first lesson). Same response as `/attempts`. Completing it restores 1 heart; wrong answers are free; no XP |
| `POST /api/hearts/refill` | spend `refill_cost_gems` (100) to refill to 5. `409 hearts_full`, `402 insufficient_gems` |

### Leaderboard
`GET /api/leaderboard` → `{period_start, period_end, rows[top 10], current_user}`; each row `{rank, user_id, display_name, avatar_color, xp, is_current_user}`; XP is the sum of the last 7 UTC days.

## Deviations from the suggested API (and why)

| Suggested | Implemented | Reason |
| --- | --- | --- |
| `POST /api/activity` | **not exposed** | A client-callable "I was active" endpoint would let the browser bump the streak, contradicting "the client is never authoritative for streak". Activity is recorded server-side as a side effect of correct answers and lesson completion (`gamification.record_activity`). |
| (none) `POST /lessons/{id}/attempts` | added | Gives answers and completion a server-side *context* (an attempt) so completion can be verified, resumed and made idempotent. |
| (none) `POST /exercises/{id}/check-pair` | added | Match-pairs needs per-tile feedback; the oracle is side-effect free. See DECISIONS D-6. |
| (none) `GET /courses/{id}/path` | added | One round trip returns the whole path with per-user state. `/units` and `/skills` still exist. |
| (none) `PATCH /me/daily-goal` | added | Makes the Settings daily-goal control real. |

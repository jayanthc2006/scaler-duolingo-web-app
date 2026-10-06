# Lesson engine

There is **one** lesson engine, shared by every exercise type, by normal lessons and by practice sessions.

```
LessonScreen ── useLessonSession (I/O: API calls, idempotency key, shared learner)
      │               │
      │               └─ lessonReducer (pure state machine, lib/lesson/lessonMachine.ts)
      ├─ LessonHeader     close, progress bar, hearts
      ├─ ExerciseRenderer ── switch(exercise.type) ─► one of five components
      └─ FeedbackBar      Check / green-or-red feedback / Continue
```

## State machine

States are a discriminated union (`Phase`), not boolean flags.

```
            LOADED                SUBMIT              ANSWER_OK
 loading ───────────► question ──────────► checking ───────────► feedback
    ▲  │ LOAD_FAILED    ▲  ▲  ▲                │ ANSWER_FAILED     │
    │  ▼ (out of        │  │  └────────────────┘ (network error:   │ CONTINUE
    │  hearts)          │  │                      back to question │
 error                  │  │                      with a notice)   ├─ correct, queue not empty ──► question
  ▲ RETRY               │  │                                       ├─ wrong + hearts left ───────► question (exercise re-queued)
  │                     │  │ HEARTS_RESTORED                       ├─ wrong + 0 hearts ──────────► out_of_hearts
  │                     │  └───────────────── out_of_hearts ◄──────┘
  │ COMPLETE_FAILED     │                            (also entered if the server rejects with out_of_hearts,
 completing ◄───────────┴─ CONTINUE with empty queue    or if a lesson cannot even start with 0 hearts)
     │ COMPLETE_OK
     ▼
  complete
```

Mapping to the spec's conceptual states: `QUESTION`=`question`, `ANSWERED`=`checking`, `FEEDBACK`=`feedback`
(its `result.correct` distinguishes correct/incorrect; `result.heart_lost` is the `HEART_LOST` step),
`NEXT_QUESTION`=the `CONTINUE` transition, `OUT_OF_HEARTS`=`out_of_hearts`, `LESSON_COMPLETE`=`complete`.

Invalid events are ignored (the reducer returns the same state object): e.g. `CONTINUE` while `checking`, or
`SUBMIT` with no draft. This is covered by `lessonMachine.test.ts` (13 tests).

### Queue semantics
`queue` holds the ids of exercises still unsolved; `queue[0]` is current. A correct answer removes it; an
incorrect one moves it to the **end**, so the learner must eventually solve every exercise. Progress =
solved / total (a correct answer is credited immediately, before Continue). The exercise component is
re-mounted on each `step` so a re-queued exercise starts with clean input.

### Resume
`POST /lessons/{id}/attempts` returns the existing open attempt plus `solved_exercise_ids`. `LOADED` removes those
from the queue, so a refresh (or leaving and coming back) continues exactly where the learner stopped; hearts lost so far
stay lost because they were persisted.

## Exercise contract

Every exercise component receives `ExerciseViewProps<Payload>`:

| Prop | Meaning |
| --- | --- |
| `payload` | public rendering data from the backend (no answer key) |
| `disabled` | input locked during `checking`/`feedback` |
| `verdict` | `null` → `"correct"`/`"incorrect"` once the backend has judged |
| `correctAnswer` | the backend's solution text (only after an incorrect answer) |
| `onAnswer(answer \| null)` | report the current draft; `null` = nothing to submit (keeps *Check* disabled) |

`ExerciseRenderer` is the only place that knows the five types; adding a sixth = one component + one `case`.

| Type | UI | Draft sent to the backend |
| --- | --- | --- |
| `multiple_choice` | radio-group buttons, number keys 1–n | `{option_id}` |
| `translate` | speech bubble + **WordBank** (tap to build / tap to remove; index-based so duplicate words work) | `{tokens[]}` |
| `match_pairs` | two columns of tiles; tap one on each side | `{pairs[]}` once every pair is matched |
| `fill_blank` | sentence with a blank + option chips (tap the blank to clear) | `{text}` |
| `type_answer` | speech bubble + text input (autofocus, `lang` set, spellcheck off) | `{text}` |

**Match pairs** keeps its own state (selected tile per side, matched map, wrong flash). When both sides are
selected it asks `POST /exercises/{id}/check-pair` (through `useLessonSession.checkPair`, with the attempt id and a per-attempt
request id); a correct pair locks both tiles, a wrong one flashes red, costs one heart (decided by the server, shown from its
response; at 0 hearts the lesson enters the out-of-hearts flow) and unselects. Only when all pairs are matched does it call `onAnswer`. The final answer is still validated by the
backend, so skipping the UI cannot bypass validation.

## Backend answer handling

`services/answers.submit_answer` (see ARCHITECTURE.md for the flow). Key properties:

* **Authoritative**: correctness comes only from `evaluation.evaluate(type, exercise.answer, payload)`.
  Malformed bodies → `422 invalid_answer` *before* any mutation (no heart is lost for a bug).
* **Per-answer idempotency**: the client generates a `request_id` (UUID) per submission and reuses it when
  re-sending the *same* draft after a failed request (`useLessonSession.lastRequest`). The server stores it in
  `exercise_attempts` (UNIQUE per attempt) and replays the stored outcome. A lost response therefore can never cost a
  second heart. Reusing an id for a different exercise → `409 request_id_reuse`.
* **Solved-once**: a second correct submission for the same exercise in the same attempt returns
  `already_solved: true`, 0 XP (also enforced by the partial unique index `uq_exercise_solved`).
* **Hearts**: wrong answer in a `lesson` attempt → −1 heart (`hearts_updated_at` set to now if it was full, so
  regeneration starts at that moment). At 0 hearts, further answers → `409 out_of_hearts`. Practice attempts never touch hearts.
* **XP and activity**: correct answer in a `lesson` attempt → `+XP_PER_CORRECT` (2), recorded through
  `record_activity` (total XP, today's `daily_activity` row, streak).

## Completion (`services/completion.complete_attempt`)

1. Attempt must belong to this user **and** this lesson, else `404`.
2. Already `completed` → return the stored outcome with `already_completed: true`; nothing is applied again.
3. **Verify** every exercise of the lesson has a correct `exercise_attempt` in this attempt, else `409 lesson_incomplete`.
   The client's own belief that it finished is never consulted.
4. Atomic claim: `UPDATE ... SET status='completed' WHERE id=? AND status='in_progress'`; if `rowcount == 0` another
   request won → replay.
5. Winner applies, in the same transaction: completion bonus (+10 XP), gems (+5), `user_skill_progress`
   (`max(lessons_completed, lesson.position)`, sets `completed_at` when the skill is finished), `daily_activity` +
   streak, new achievements. **Practice** attempts instead restore +1 heart and give no XP.
6. One `commit()`. A crash before it leaves nothing applied.

## Legendary challenge

A timed re-run of a lesson the learner already finished. It is deliberately **not** a second engine:

* `POST /legendary/start` (`services/legendary.py`) only chooses the lesson and creates a `lesson_attempts` row with `kind='legendary'`.
  Everything after that is the normal loop: the same exercises, the same `POST /exercises/{id}/answer` (a legendary attempt behaves like
  practice: free mistakes, no XP), the same `POST /lessons/{id}/complete` and the same `useLessonSession` / reducer. The reducer is unchanged.
* Time lives on the server: time used = real elapsed time + a fixed penalty (`LEGENDARY_WRONG_ANSWER_PENALTY_SECONDS`, 5 s) per wrong
  answer or wrong pair. The penalty is *derived* from the attempt's own recorded wrong `exercise_attempts` (`legendary.penalty_seconds`), so it
  needs no new column, survives a refresh, cannot be set or skipped by the client, and a repeated `request_id` never inserts a second row, so
  it cannot be charged twice (writes are serialised by `begin_write`). `complete_attempt` calls `legendary.check_can_complete` before anything
  is applied: used time beyond the limit + 3 s grace → the attempt is closed as `failed` and `409 legendary_expired`; a lesson already won →
  `409 legendary_already_won`. Answers after the (penalty-adjusted) time is up are refused. Answer responses carry `seconds_left`; the client's
  countdown (`useDeadline`) restarts from it, so the display follows the server and only drives the time's-up screen.
* Winning applies one transaction: +20 XP (via `record_activity`, so streak, daily goal and the weekly leaderboard see it) and +10 gems,
  then achievements are re-evaluated. It does **not** touch `user_skill_progress` or hearts, and it does not count as a lesson
  completion (`lessons` metric counts `kind='lesson'` only).
* Lifecycle: *refresh* resumes the live attempt (same id, same remaining time, penalties kept); *End Session* (the X) calls
  `POST /legendary/{id}/end`, which sets the terminal status `abandoned` (no reward, no progress, never resumable; repeating it is harmless), so
  the next *Start* creates a new attempt with a full clock; *timeout* closes the run as `failed` and *Try again* starts a new one; a *win*
  completes it (reward once per lesson).
* Exploit paths: replaying `/complete` is the idempotent replay; a failed or abandoned attempt can never complete; the generic start endpoint rejects
  `kind='legendary'`; the reward is paid once per lesson (service check + partial unique index); slow runs are rejected by the server clock.
* Frontend: `/legendary` (hub: rules, availability, Start) and `/legendary/play` (the run, full-screen like lessons). The header swaps the
  hearts for a countdown; at 0 a "Time's up" modal offers *Try again* (a fresh server-timed attempt) or *Back*. The X opens an *End this challenge?* dialog;
  confirming waits for the server to abandon the attempt before returning to the hub, and a failed request keeps the learner on the run with a retry.

## Hearts, XP, streak, daily goal (all in `services/gamification.py`)

| Rule | Implementation |
| --- | --- |
| Max hearts 5; wrong answer −1 | `lose_heart`; constants in `Settings` (`MAX_HEARTS`) |
| Regeneration | lazy: `sync_hearts` adds `elapsed // HEART_REGEN_SECONDS` hearts (default 1800 s) whenever the learner is read or mutated; anchor `hearts_updated_at` advances by whole intervals. Configurable and tested with `FixedClock` |
| Refill | `POST /hearts/refill`: costs 100 gems, sets hearts to 5 |
| Practice | restores 1 heart, no XP |
| Streak | `apply_streak(stats, today)`: same day → unchanged; yesterday → +1; otherwise → 1; `longest_streak` is the max. `effective_streak` shows 0 for a streak that was already broken |
| Daily goal | `user_stats.daily_goal_xp`; progress = today's `daily_activity.xp_earned` |
| Day boundary | UTC calendar days from the injected `Clock` |

## Frontend I/O hook (`useLessonSession`)

* `loading` effect → `startAttempt`; `409 out_of_hearts` becomes the out-of-hearts phase (not an error screen).
* `completing` effect → `completeLesson`; failures go to an `error` phase with *Try again* (safe: completion is idempotent).
* Every response containing `learner` is pushed to `LearnerContext` so the top bar is always server-accurate.
* Keyboard: **Enter** = Check / Continue (handled globally, skipped when the primary button itself has focus to avoid double
  firing), **1–n** selects a multiple-choice option.

# Design decisions

Each entry: the decision, why, and what was rejected.

**D-1. Attempts as the unit of work.** Answers and completion happen inside a `lesson_attempt`.
*Why:* completion can be verified server-side ("every exercise has a correct answer in this attempt"), it is
resumable after a refresh, and it gives an idempotency scope. *Rejected:* stateless "submit answer for exercise X"
+ "complete lesson X" - the server would have nothing to verify completion against.

**D-2. Answer key never leaves the server.** Separate `payload` (public) / `answer` (private) columns and an
`ExercisePublic` schema without an answer field; the solution text is revealed only in the response to an incorrect
answer. Tested by asserting forbidden keys do not appear in the raw response body. *Rejected:* one JSON blob with fields
stripped in the router (one forgotten `pop` leaks answers).

**D-3. Backend decides everything persistent.** XP, hearts, streak, progress and completion are computed server-side
and returned in a `learner` snapshot; the client never does arithmetic on them. *Cost:* every action is a round trip.

**D-4. No `POST /api/activity`.** A client-callable activity endpoint would let the browser extend the streak.
Activity is recorded as a side effect of correct answers and completions. (Documented in API.md.)

**D-5. Idempotency via client request ids + DB constraints.** `request_id` (UUID per submission, reused on retry of the
same draft) is UNIQUE per attempt; partial unique indexes make "solved once per attempt", "one open attempt per lesson"
and "completed once per lesson" impossible to violate even under races. Completion additionally uses an atomic
compare-and-set. *Rejected:* in-process locks (break with several workers) and "trust the client to send once".

**D-6. Match-pairs checks each pair on the server, and a wrong pair costs a heart.** Per-pair feedback requires the server's
answer, so `check-pair` answers "does this left match this right?" for one completed pair (two taps). A wrong pair is a mistake like
any wrong answer: -1 heart in a real lesson (free in practice / legendary), decided and recorded server-side as an `exercise_attempt`
under the client's `request_id`, so retries and duplicate requests are replays, not extra charges. The call is attempt-scoped
(ownership, same lesson, open attempt), so it cannot be used as a free oracle: brute-forcing a pairing costs hearts. The final `answer`
is still validated by the normal path. *Rejected:* sending the key to the client; a client-reported heart loss; keeping the endpoint free
(wrong pairs would then be the only mistakes that cost nothing).

**D-7. Linear unlock rule + derived statuses.** Lesson *k* unlocks when lesson *k−1* (across skills/units) is done.
Only `lessons_completed` is stored; statuses are derived, so there are no flags to drift out of sync.

**D-8. Leaderboard is derived.** Weekly XP = sum of the last 7 UTC days from `daily_activity`. No rank column to maintain;
the demo learner visibly overtakes seeded rivals after one lesson. *Alternative:* all-time XP from `user_stats` (simpler but
less engaging and not "weekly").

**D-9. `create_all` instead of Alembic.** The schema is small and the data is seed-derived; a migration framework would be
ceremony. *Production:* introduce Alembic before the first schema change on a database holding real users.

**D-10. Lazy heart regeneration.** No background job: hearts are recomputed from `hearts_updated_at` when read. Deterministic,
testable with a fixed clock, and correct across restarts.

**D-11. UTC days.** Streak/daily-goal boundaries are UTC days from an injected clock. *Limitation:* a learner far from UTC
sees the day roll over at an odd local time. A per-user time zone would be the next step.

**D-12. Practice = free mistakes, +1 heart, no XP.** Prevents an XP farm and a heart-loss spiral while still giving the
"practice to earn a heart" loop. Practice reuses the same engine and endpoints (`kind: "practice"`).

**D-13. Plain CSS, hand-made SVG, no UI/animation libraries.** Fewer dependencies; design tokens as CSS variables;
`prefers-reduced-motion` respected. The mascot, icons and path artwork are original SVG (no Duolingo assets).

**D-14. Frontend deps are Next/React/TypeScript + (dev) ESLint, Vitest, Testing Library, jsdom.** Backend: FastAPI, Uvicorn,
SQLAlchemy + (dev) pytest, httpx (needed by `TestClient`), ruff. Settings use `os.environ` rather than `pydantic-settings`.

**D-15. Client-side state is minimal.** Server data is fetched with a tiny `useAsync` hook and a `LearnerContext`; no
React Query/Redux. Only harmless UI hints use browser storage (which skills changed since the last visit, in
`sessionStorage`).

**D-16. SQLite in production needs a persistent disk.** See README → Deployment. The app never overwrites existing
data on boot (`seed_database` is a no-op when a course exists).

**D-18. Write lock before read-decide-write.** Under SQLite's default deferred transactions two requests can read the same
state and both write (lost update), e.g. parallel wrong answers all seeing "hearts > 0". `begin_write` issues `BEGIN IMMEDIATE`
at the start of each mutating service so the sequence is serialised. *Rejected:* optimistic version columns (more code, retries)
and in-process locks (break with several workers). *Trade-off:* writers queue; acceptable for SQLite, which is single-writer anyway.

**D-19. Bounded ids.** Path/body ids are validated to the 64-bit range so oversized values return `422`, not an
`OverflowError` 500.

**D-17. Accent handling.** Typed and fill-in answers ignore case, punctuation, the accents on `áéíóúü` and, deliberately, a missing `ñ`
(`pequena` = `pequeña`): the learner-friendly typing Duolingo-style apps offer, applied in one place (`normalize(fold_enye=True)`) and
only to free text. Word-bank tokens keep `ñ` distinct (they are tiles, not typing). Feedback still shows the properly accented answer.
*Trade-off:* `ano` and `año` are not told apart when typed.

**D-20. Legendary reuses the lesson engine; the server owns the clock.** A new attempt `kind='legendary'` on a lesson the learner
already completed, started by its own endpoint (so the generic start cannot mint one). Answers, completion, idempotency and the
frontend reducer are shared; only the lesson choice, the deadline check and the reward branch are new (`services/legendary.py`).
*Rejected:* a separate challenge engine/tables (duplicated grading), a client-reported "I finished in time" (forgeable), a
cross-lesson question pool (would have required relaxing the "exercise belongs to the attempt's lesson" check in the core).
*Trade-off:* the challenge is one lesson's six exercises, so it is short; the reward is once per lesson, which bounds farming.

**D-21. Exercise audio = browser `SpeechSynthesis`.** No recorded files, no TTS service, no backend change, graceful when
unsupported (the button is disabled with an explanation; nothing else changes). Which text is spoken is a pure frontend rule
(`lib/audio/speakable.ts`): only Spanish text is spoken (so never the English word in a "How do you say..." prompt), and a
finished answer is read only after the backend has judged it, so audio can never leak a key. *Trade-off:* voice quality depends on the device.

**D-22. Dark mode = tokens + `data-scheme`, not a filter.** `<html data-scheme="light|dark">` (a separate axis from the existing
`data-theme` unit colours) swaps the CSS variables; surfaces that were hard-coded white now use `--card` / `--bg`, and accent *text*
uses `--*-ink` tokens that equal the old `-dark` values in light mode (so light mode is unchanged). A tiny inline script sets the
attribute before first paint (no flash); the choice (Light/Dark/Auto, default Auto) lives in `localStorage`.

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

**D-6. Match-pairs uses a probe endpoint.** Per-tile feedback requires the server's answer, so `check-pair` answers
"does this left match this right?" without side effects. *Trade-off (accepted):* an adversary can brute-force a pairing
(n² probes) - for a vocabulary-matching game with no stakes this is the same information a learner gets by playing;
the final `answer` is still validated, and wrong probes cost no heart. *Rejected:* sending the key to the client; or
charging a heart per wrong pair (punitive; Duolingo-like UX is lenient).

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

**D-17. Accent handling.** Typed answers ignore case, punctuation and the accents on `áéíóúü`, but not `ñ`
(`ano` ≠ `año`). Documented in API.md; trivial to tighten per exercise.

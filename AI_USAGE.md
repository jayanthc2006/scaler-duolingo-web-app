# AI usage log

This project was built in a single agentic session with **Claude Code (Claude Sonnet 5.5)** working directly in the
repository: it inspected the (empty) repo, wrote the code and tests, ran them, drove the app in a browser, and fixed what
it found.

**Use of public repositories.** During two refinement passes, public Duolingo-clone repositories were reviewed *only* as
architecture, UX and visual benchmarks (for example, which structural and visual principles such an app tends to follow). No
source code, assets, proprietary material or repository-specific implementation was copied or adapted from them or from any
template. The code, the SVG icons, the mascot, the CSS and the course content in this repository were written during the
session. This file records, per subsystem, what the AI did, how it was checked, and what it got wrong.

> **Honesty note.** "Reviewed" below means *verified by tests, by running the app, or by inspecting output during the
> session*. Whether **you** have read each file line by line is something only you can attest - use the checklist at the
> end and edit this file accordingly before submitting.

| Subsystem | AI was asked to | AI generated | How it was checked | Changed after checking | Why the final design |
| --- | --- | --- | --- | --- | --- |
| Data model | design a normalised SQLite schema for content + learner state with constraints and indexes | `models/content.py`, `models/learner.py`, partial unique indexes, CHECKs | 122 backend tests (107 core + 15 for the later Legendary feature) incl. DB-level constraint tests; `sqlite_master` dump | removed two unjustified indexes (`ix_exercises_lesson`, `ix_user_stats_xp`) | indexes must each protect an invariant or serve a query (DATABASE.md) |
| Seed + content | seed a small Spanish course with all five exercise types, deterministic | `seed/builders.py`, `seed/content.py`, `seed/seed.py` | determinism + idempotency tests; manual play of lesson 1 | **bug:** `Unit(course=course)` no longer adds to the session in SQLAlchemy 2.1 → rewrote with `course.units.append(...)` | explicit parent-collection appends are version-proof |
| Answer evaluation | authoritative validation per type, hidden key | `services/evaluation.py`, public/private column split, `ExercisePublic` | unit tests per type; test asserting forbidden keys are absent from raw responses | none | pure functions are cheap to test; schema without an answer field cannot leak it |
| Gamification | hearts, XP, streak, daily goal, regen, refill, practice | `services/gamification.py`, `profile.py` | pure-function tests with a fixed clock; API tests across simulated days | none functionally; moved `mistakes` counting to include practice | injected clock → deterministic date logic |
| Completion + idempotency | verify completion server-side; no duplicate awards | `services/answers.py`, `completion.py`, request-id replay, atomic CAS | sequential duplicate tests; **parallel** tests on a file DB; mutation test (disable guard → test fails) | none | layered protection: service checks, CAS, unique indexes |
| Learning path | derived statuses + unlock rule | `services/progress.py` | API tests for locked/available/in-progress/completed transitions | renamed shadowing variables flagged by ruff | derived state cannot drift |
| Lesson state machine | pure reducer with a discriminated-union phase | `lessonMachine.ts` + `useLessonSession.ts` | 13 reducer tests; full manual run incl. wrong answer, out-of-hearts, resume | added `step` counter (re-queued exercise kept stale input); progress now credits a correct answer immediately; out-of-hearts-at-start made a first-class phase | reducer is the testable core; I/O isolated in one hook |
| Exercise components | five reusable components behind one renderer | `components/exercises/*` | 12 exercise-component tests + 7 FeedbackBar tests (word bank, duplicate words, match flow, wrong pair, network error) + manual play | match-pairs originally dropped clicks while a check was in flight - root cause was `localhost` IPv6 latency (see below), kept the guard | one contract (`ExerciseViewProps`) |
| UI / visual design | Duolingo-like hierarchy with original assets | CSS tokens, SVG icons, mascot, path geometry, shell | screenshots at tablet/desktop/mobile widths; fixed from what was seen | icon cut-outs invisible on white-icon nodes → `--icon-cut` variable; START bubble offset the node → absolute positioning + larger step; sad mascot looked angry → flipped brows; duplicated daily-goal card on wide screens; matched tiles struck through → removed | visual QA loop per the brief |
| Backend dev tooling | tests, lint, deploy files | `tests/*`, `pyproject.toml`, `Dockerfile`, `render.yaml` | pytest, ruff; **Dockerfile / render.yaml were NOT built or deployed** | - | - |
| Documentation | accurate docs for the real implementation | `README.md`, `docs/*` | numbers and endpoints cross-checked against code and a live DB dump | - | - |

## Things the AI got wrong (caught during the session)

1. SQLAlchemy 2.1 behaviour change (seed lost units) - caught by the first test run.
2. `make_engine("sqlite://")` didn't treat the URL as in-memory, giving every connection an empty database - caught by tests.
3. Test asserted `"display"` was absent from a body that legitimately contained `display_name` - test bug, tightened.
4. Windows `localhost` resolved IPv6 first, costing ~220 ms per call; fixed by using `127.0.0.1` for the dev API URL.
5. White "cut-out" details inside icons vanished on nodes whose icon colour is white.
6. Out-of-hearts modal showed "0 gems" because it read a learner object that is `null` before the attempt loads.
7. Package files written with a UTF-8 BOM by PowerShell broke `package.json` parsing in Next.
8. Practice-mode mistakes were not counted (accuracy always 100 %).
9. (Pass 3 break-tests) Oversized ids (`/api/lessons/1180591620717411303424`) caused an `OverflowError` → HTTP 500; ids are now bounded.
10. (Pass 3) A **lost-update race**: with 16 parallel wrong answers all 16 reported a lost heart (each read "hearts > 0"), so heart loss
    could be dodged. The earlier concurrency tests used 8 workers and passed by luck. Fixed with `BEGIN IMMEDIATE` (`begin_write`) and
    verified 25/25 stable runs at 16 workers.

### Bonus pass (audio, legendary, dark mode)

* Audited first: achievements, leaderboard and responsive were already complete and were not rebuilt; audio, the timed challenge and dark
  mode were missing.
* Legendary was designed to reuse the lesson engine (new attempt kind + server deadline) instead of a second engine; the generic start
  endpoint was explicitly closed to the new kind so a client cannot mint one.
* Things the assistant got wrong along the way: a `kind` literal shared by the start request and the response would have let the
  generic endpoint create legendary attempts (caught while writing the tests); a first `useDeadline` draft used `Math.round` and would
  have shown 0:00 half a second early (switched to ceil); an inline-`#fff` sweep missed `--b-bg` / `::before` surfaces until the dark
  screens were actually viewed; Node's experimental `localStorage` shadowed jsdom's in the theme test.
* Verified by running: backend 122 tests, frontend 57 tests, a real browser run of a full legendary win (+20 XP, rank 5 → 3), a time-out,
  a retry, and the audio calls (a stubbed `speechSynthesis.speak` recorded `es-ES` utterances; the actual sound was not audible to me).

## What was *not* done / not verified

* No real deployment was performed (no hosting accounts or credentials available in the session). `render.yaml` and the
  Dockerfile are untested templates.
* No cross-browser testing beyond the embedded Chromium; no automated end-to-end (Playwright) suite; accessibility was
  checked by construction (roles, labels, focus styles) and keyboard flow, not with a screen reader.

## Your review checklist (edit before submitting)

- [ ] I read `services/answers.py` and `services/completion.py` and can explain every branch.
- [ ] I read `lessonMachine.ts` and can draw the state diagram.
- [ ] I ran the backend and frontend tests myself.
- [ ] I played one full lesson, drained hearts, and tried refill and practice.
- [ ] Things I changed myself: _…_
- [ ] Things I disagreed with / would do differently: _…_

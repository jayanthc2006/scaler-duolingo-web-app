import { describe, expect, it } from "vitest";
import type { AnswerResult, Attempt, CompleteResult, Exercise, Learner } from "@/lib/types/api";
import { currentExercise, initialLessonState, lessonReducer, progressFraction, type LessonAction, type LessonState } from "./lessonMachine";

const learner: Learner = {
  id: 1, username: "a", display_name: "A", avatar_color: "blue", xp_total: 0, hearts: 5, max_hearts: 5,
  next_heart_in_seconds: null, gems: 0, refill_cost_gems: 100, current_streak: 0, longest_streak: 0,
  streak_active_today: false, daily_goal_xp: 30, daily_xp: 0,
};
const ex = (id: number): Exercise => ({ id, position: id, type: "type_answer", prompt: "p", payload: { source_text: "x", direction: "to_target" } });
const attempt = (solved: number[] = []): Attempt => ({
  attempt_id: 7, lesson_id: 3, lesson_title: "L", kind: "lesson", exercises: [ex(1), ex(2), ex(3)], solved_exercise_ids: solved, learner,
});
const result = (over: Partial<AnswerResult> = {}): AnswerResult => ({
  correct: true, already_solved: false, xp_awarded: 2, heart_lost: false, out_of_hearts: false,
  correct_answer: null, explanation: null, learner, ...over,
});
const done: CompleteResult = {
  kind: "lesson", already_completed: false, xp_from_answers: 6, xp_completion_bonus: 10, xp_total_gained: 16,
  gems_awarded: 5, hearts_gained: 0, mistakes: 0, skill_id: 1, skill_completed: false, new_achievements: [], learner,
};

const run = (...actions: LessonAction[]): LessonState => actions.reduce(lessonReducer, initialLessonState);
const answer = (res: AnswerResult): LessonAction[] => [
  { type: "DRAFT", answer: { text: "x" } }, { type: "SUBMIT" }, { type: "ANSWER_OK", result: res }, { type: "CONTINUE" },
];

describe("lessonReducer", () => {
  it("starts in loading and enters question once loaded", () => {
    expect(initialLessonState.phase.name).toBe("loading");
    const s = run({ type: "LOADED", attempt: attempt() });
    expect(s.phase.name).toBe("question");
    expect(currentExercise(s)?.id).toBe(1);
    expect(progressFraction(s)).toBe(0);
  });

  it("resumes an attempt, skipping exercises that are already solved", () => {
    const s = run({ type: "LOADED", attempt: attempt([1, 2]) });
    expect(currentExercise(s)?.id).toBe(3);
    expect(s.solvedCount).toBe(2);
  });

  it("goes straight to completing when everything was already solved", () => {
    expect(run({ type: "LOADED", attempt: attempt([1, 2, 3]) }).phase.name).toBe("completing");
  });

  it("cannot submit without a draft answer", () => {
    const s = run({ type: "LOADED", attempt: attempt() }, { type: "SUBMIT" });
    expect(s.phase.name).toBe("question");
  });

  it("walks question -> checking -> feedback -> next question", () => {
    let s = run({ type: "LOADED", attempt: attempt() }, { type: "DRAFT", answer: { text: "a" } }, { type: "SUBMIT" });
    expect(s.phase.name).toBe("checking");
    s = lessonReducer(s, { type: "ANSWER_OK", result: result() });
    expect(s.phase.name).toBe("feedback");
    s = lessonReducer(s, { type: "CONTINUE" });
    expect(s.phase.name).toBe("question");
    expect(currentExercise(s)?.id).toBe(2);
    expect(s.draft).toBeNull();
    expect(progressFraction(s)).toBeCloseTo(1 / 3);
  });

  it("re-queues an incorrectly answered exercise at the end and updates hearts", () => {
    const bad = result({ correct: false, heart_lost: true, correct_answer: "x", learner: { ...learner, hearts: 4 } });
    const s = run({ type: "LOADED", attempt: attempt() }, ...answer(bad));
    expect(s.queue).toEqual([2, 3, 1]);
    expect(s.solvedCount).toBe(0);
    expect(s.learner?.hearts).toBe(4);
  });

  it("enters out_of_hearts after continuing from a fatal mistake, and resumes after a refill", () => {
    const fatal = result({ correct: false, heart_lost: true, out_of_hearts: true, learner: { ...learner, hearts: 0 } });
    let s = run({ type: "LOADED", attempt: attempt() }, ...answer(fatal));
    expect(s.phase.name).toBe("out_of_hearts");
    s = lessonReducer(s, { type: "HEARTS_RESTORED", learner });
    expect(s.phase.name).toBe("question");
    expect(s.queue).toEqual([2, 3, 1]);
  });

  it("treats a server out_of_hearts rejection as the out_of_hearts phase", () => {
    const s = run(
      { type: "LOADED", attempt: attempt() }, { type: "DRAFT", answer: { text: "a" } }, { type: "SUBMIT" },
      { type: "ANSWER_FAILED", message: "no", outOfHearts: true },
    );
    expect(s.phase.name).toBe("out_of_hearts");
    expect(s.learner?.hearts).toBe(0);
  });

  it("shows out_of_hearts when a lesson cannot even start, then loads after a refill", () => {
    let s = run({ type: "LOAD_FAILED", message: "no hearts", outOfHearts: true });
    expect(s.phase.name).toBe("out_of_hearts");
    s = lessonReducer(s, { type: "HEARTS_RESTORED", learner });
    expect(s.phase.name).toBe("loading");
  });

  it("returns to the question with a notice when a request fails, keeping the draft", () => {
    const s = run(
      { type: "LOADED", attempt: attempt() }, { type: "DRAFT", answer: { text: "a" } }, { type: "SUBMIT" },
      { type: "ANSWER_FAILED", message: "offline" },
    );
    expect(s.phase.name).toBe("question");
    expect(s.notice).toBe("offline");
    expect(s.draft).toEqual({ text: "a" });
  });

  it("completes the lesson after the last correct answer", () => {
    let s = run({ type: "LOADED", attempt: attempt([1, 2]) }, ...answer(result()));
    expect(s.phase.name).toBe("completing");
    expect(progressFraction(s)).toBe(1);
    s = lessonReducer(s, { type: "COMPLETE_OK", result: done });
    expect(s.phase.name).toBe("complete");
  });

  it("can retry a failed completion without losing progress", () => {
    let s = run({ type: "LOADED", attempt: attempt([1, 2]) }, ...answer(result()), { type: "COMPLETE_FAILED", message: "x" });
    expect(s.phase).toMatchObject({ name: "error", retry: "complete" });
    s = lessonReducer(s, { type: "RETRY" });
    expect(s.phase.name).toBe("completing");
  });

  it("ignores events that are invalid for the current phase", () => {
    const s = run({ type: "LOADED", attempt: attempt() });
    expect(lessonReducer(s, { type: "CONTINUE" })).toBe(s);
    expect(lessonReducer(s, { type: "ANSWER_OK", result: result() })).toBe(s);
    expect(lessonReducer(s, { type: "HEARTS_RESTORED", learner })).toBe(s);
  });

  describe("PAIR_MISS (a wrong match-pairs pair)", () => {
    const loaded = (): LessonState => run({ type: "LOADED", attempt: attempt() });
    const fewer: Learner = { ...learner, hearts: 4 };

    it("adopts the server's learner without leaving the question", () => {
      const s = lessonReducer(loaded(), { type: "PAIR_MISS", learner: fewer, outOfHearts: false });
      expect(s.phase.name).toBe("question");
      expect(s.learner?.hearts).toBe(4);
      expect(s.queue).toEqual([1, 2, 3]); // nothing is re-queued or solved: the exercise is still open
      expect(s.solvedCount).toBe(0);
    });

    it("enters out_of_hearts when that was the last heart", () => {
      const s = lessonReducer(loaded(), { type: "PAIR_MISS", learner: { ...learner, hearts: 0 }, outOfHearts: true });
      expect(s.phase.name).toBe("out_of_hearts");
    });

    it("treats a bare out-of-hearts refusal as zero hearts", () => {
      const s = lessonReducer(loaded(), { type: "PAIR_MISS", learner: null, outOfHearts: true });
      expect(s.phase.name).toBe("out_of_hearts");
      expect(s.learner?.hearts).toBe(0);
    });

    it("is ignored outside a question, and the existing refill recovery still works afterwards", () => {
      const checking = run({ type: "LOADED", attempt: attempt() }, { type: "DRAFT", answer: { text: "x" } }, { type: "SUBMIT" });
      expect(lessonReducer(checking, { type: "PAIR_MISS", learner: fewer, outOfHearts: true })).toBe(checking);
      const out = lessonReducer(loaded(), { type: "PAIR_MISS", learner: { ...learner, hearts: 0 }, outOfHearts: true });
      const back = lessonReducer(out, { type: "HEARTS_RESTORED", learner });
      expect(back.phase.name).toBe("question");
      expect(back.step).toBe(out.step + 1); // the exercise remounts fresh, like any other recovery
    });
  });
});

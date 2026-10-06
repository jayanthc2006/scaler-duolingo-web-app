/**
 * Lesson state machine (pure reducer, no I/O).
 *
 *   loading -> question -> checking -> feedback -> question ... -> completing -> complete
 *                                          \-> out_of_hearts -> question (after refill)
 *
 * The backend decides correctness; this reducer only sequences the UI around its answers.
 * A wrongly answered exercise is re-queued to the end until it is solved, so "lesson done"
 * means every exercise has been solved once (the same rule the server verifies on completion).
 */
import type { AnswerPayload, AnswerResult, Attempt, CompleteResult, Exercise, Learner } from "@/lib/types/api";

export type Phase =
  | { name: "loading" }
  | { name: "error"; message: string; retry: "load" | "complete" }
  | { name: "question" }
  | { name: "checking" }
  | { name: "feedback"; result: AnswerResult }
  | { name: "out_of_hearts" }
  | { name: "completing" }
  | { name: "complete"; result: CompleteResult };

export interface LessonState {
  phase: Phase;
  attempt: Attempt | null;
  /** exercise ids still to be solved; queue[0] is the current exercise */
  queue: number[];
  solvedCount: number;
  /** increments on every CONTINUE so a re-queued exercise remounts with fresh input state */
  step: number;
  draft: AnswerPayload | null;
  learner: Learner | null;
  /** non-fatal message (e.g. a failed request) shown next to the check button */
  notice: string | null;
}

export type LessonAction =
  | { type: "LOADED"; attempt: Attempt }
  | { type: "LOAD_FAILED"; message: string; outOfHearts?: boolean }
  | { type: "DRAFT"; answer: AnswerPayload | null }
  | { type: "SUBMIT" }
  | { type: "ANSWER_OK"; result: AnswerResult }
  | { type: "ANSWER_FAILED"; message: string; outOfHearts?: boolean }
  | { type: "CONTINUE" }
  | { type: "COMPLETE_OK"; result: CompleteResult }
  | { type: "COMPLETE_FAILED"; message: string }
  | { type: "RETRY" }
  | { type: "HEARTS_RESTORED"; learner: Learner };

export const initialLessonState: LessonState = {
  phase: { name: "loading" },
  attempt: null,
  queue: [],
  solvedCount: 0,
  step: 0,
  draft: null,
  learner: null,
  notice: null,
};

export function lessonReducer(state: LessonState, action: LessonAction): LessonState {
  switch (action.type) {
    case "LOADED": {
      const { attempt } = action;
      const solved = new Set(attempt.solved_exercise_ids);
      const queue = attempt.exercises.filter((e) => !solved.has(e.id)).map((e) => e.id);
      return {
        ...initialLessonState,
        attempt,
        queue,
        solvedCount: attempt.exercises.length - queue.length,
        learner: attempt.learner,
        phase: queue.length === 0 ? { name: "completing" } : { name: "question" },
      };
    }
    case "LOAD_FAILED":
      // Starting a lesson with 0 hearts is a normal game state, not an error screen.
      if (action.outOfHearts) return { ...state, phase: { name: "out_of_hearts" } };
      return { ...state, phase: { name: "error", message: action.message, retry: "load" } };

    case "DRAFT":
      if (state.phase.name !== "question") return state;
      return { ...state, draft: action.answer, notice: null };

    case "SUBMIT":
      if (state.phase.name !== "question" || state.draft === null) return state;
      return { ...state, phase: { name: "checking" }, notice: null };

    case "ANSWER_OK":
      if (state.phase.name !== "checking") return state;
      return { ...state, phase: { name: "feedback", result: action.result }, learner: action.result.learner };

    case "ANSWER_FAILED":
      if (state.phase.name !== "checking") return state;
      if (action.outOfHearts) {
        return {
          ...state,
          phase: { name: "out_of_hearts" },
          learner: state.learner && { ...state.learner, hearts: 0 },
        };
      }
      return { ...state, phase: { name: "question" }, notice: action.message };

    case "CONTINUE": {
      if (state.phase.name !== "feedback") return state;
      const { result } = state.phase;
      const [current, ...rest] = state.queue;
      const queue = result.correct ? rest : [...rest, current];
      const next: LessonState = {
        ...state,
        queue,
        solvedCount: state.solvedCount + (result.correct ? 1 : 0),
        step: state.step + 1,
        draft: null,
        notice: null,
      };
      if (!result.correct && result.out_of_hearts) return { ...next, phase: { name: "out_of_hearts" } };
      if (queue.length === 0) return { ...next, phase: { name: "completing" } };
      return { ...next, phase: { name: "question" } };
    }

    case "COMPLETE_OK":
      return { ...state, phase: { name: "complete", result: action.result }, learner: action.result.learner };
    case "COMPLETE_FAILED":
      return { ...state, phase: { name: "error", message: action.message, retry: "complete" } };

    case "RETRY":
      if (state.phase.name !== "error") return state;
      return {
        ...state,
        phase: state.phase.retry === "load" ? { name: "loading" } : { name: "completing" },
      };

    case "HEARTS_RESTORED":
      if (state.phase.name !== "out_of_hearts") return state;
      return {
        ...state,
        // before the attempt was ever created we must (re)load it; otherwise resume the question
        phase: state.attempt ? { name: "question" } : { name: "loading" },
        learner: action.learner,
        step: state.step + 1,
        draft: null,
      };
  }
}

// ---- selectors -----------------------------------------------------------------------------
export function currentExercise(state: LessonState): Exercise | null {
  if (!state.attempt || state.queue.length === 0) return null;
  return state.attempt.exercises.find((e) => e.id === state.queue[0]) ?? null;
}

export function progressFraction(state: LessonState): number {
  const total = state.attempt?.exercises.length ?? 0;
  if (total === 0) return 0;
  if (state.phase.name === "completing" || state.phase.name === "complete") return 1;
  // credit a correct answer immediately, before the learner presses Continue
  const pending = state.phase.name === "feedback" && state.phase.result.correct ? 1 : 0;
  return (state.solvedCount + pending) / total;
}

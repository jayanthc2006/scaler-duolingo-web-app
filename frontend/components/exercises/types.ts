import type { AnswerPayload } from "@/lib/types/api";

export type Verdict = "correct" | "incorrect" | null;

/** Contract every exercise component implements, so the lesson engine stays type-agnostic. */
export interface ExerciseViewProps<P> {
  payload: P;
  /** Locks input once an answer has been submitted (checking / feedback). */
  disabled: boolean;
  /** Set after the backend has judged the answer. */
  verdict: Verdict;
  /** The backend's solution text, only present after an incorrect answer. */
  correctAnswer: string | null;
  /** Report the current draft answer; `null` means "nothing to submit yet". */
  onAnswer: (answer: AnswerPayload | null) => void;
}

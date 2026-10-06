/**
 * Which Spanish text, if any, an exercise can read aloud. Pure and client-side: the course data already
 * follows one convention (quoted terms in a prompt are the word being asked about, and "How do you say ...?"
 * questions have Spanish answers), so no backend field is needed.
 */
import type { AnswerPayload, AnswerResult, Exercise } from "@/lib/types/api";

const ASKS_FOR_SPANISH = /^how do you say/i;
const QUOTED = /"([^"]+)"/;

/** Spanish the learner can listen to BEFORE answering (the thing they are asked about). */
export function promptSpeech(exercise: Exercise): string | null {
  switch (exercise.type) {
    case "multiple_choice":
      return ASKS_FOR_SPANISH.test(exercise.prompt) ? null : (QUOTED.exec(exercise.prompt)?.[1] ?? null);
    case "translate":
    case "type_answer":
      return exercise.payload.direction === "to_source" ? exercise.payload.source_text : null;
    default:
      return null; // match pairs speak on tap; fill-in-the-blank is read once it is filled
  }
}

/** The finished Spanish answer, available AFTER the backend has judged it (so it never leaks a key). */
export function answerSpeech(exercise: Exercise, draft: AnswerPayload | null, result: AnswerResult | null): string | null {
  if (!result) return null;
  // after a wrong answer the backend sends the solution text; after a right one the learner's own answer is it
  const given = (fromDraft: string | undefined) => (result.correct ? fromDraft : (result.correct_answer ?? undefined)) ?? null;
  switch (exercise.type) {
    case "multiple_choice":
      return ASKS_FOR_SPANISH.test(exercise.prompt)
        ? given(exercise.payload.options.find((o) => o.id === draft?.option_id)?.text)
        : null;
    case "translate":
      return exercise.payload.direction === "to_target" ? given(draft?.tokens?.join(" ")) : null;
    case "type_answer":
      return exercise.payload.direction === "to_target" ? given(draft?.text) : null;
    case "fill_blank":
      return given(draft?.text === undefined ? undefined : `${exercise.payload.before}${draft.text}${exercise.payload.after}`);
    default:
      return null;
  }
}

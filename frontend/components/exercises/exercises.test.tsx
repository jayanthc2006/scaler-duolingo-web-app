import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ExerciseRenderer } from "@/components/exercises/ExerciseRenderer";
import type { Exercise } from "@/lib/types/api";

const base = { id: 1, position: 1, prompt: "p" };
const view = { disabled: false, verdict: null, correctAnswer: null } as const;

function renderExercise(exercise: Exercise, extra: Partial<Parameters<typeof ExerciseRenderer>[0]> = {}) {
  const onAnswer = vi.fn();
  const checkPair = vi.fn().mockResolvedValue(true);
  render(<ExerciseRenderer exercise={exercise} onAnswer={onAnswer} checkPair={checkPair} {...view} {...extra} />);
  return { onAnswer, checkPair };
}

describe("MultipleChoiceExercise", () => {
  const exercise: Exercise = { ...base, type: "multiple_choice", payload: { options: [{ id: "a", text: "Hola" }, { id: "b", text: "Adiós" }] } };

  it("reports the chosen option id and marks it checked", async () => {
    const { onAnswer } = renderExercise(exercise);
    await userEvent.click(screen.getByRole("radio", { name: /adiós/i }));
    expect(onAnswer).toHaveBeenLastCalledWith({ option_id: "b" });
    expect(screen.getByRole("radio", { name: /adiós/i })).toHaveAttribute("aria-checked", "true");
  });

  it("supports number-key shortcuts", async () => {
    const { onAnswer } = renderExercise(exercise);
    await userEvent.keyboard("1");
    expect(onAnswer).toHaveBeenLastCalledWith({ option_id: "a" });
  });

  it("is locked once an answer has been submitted", async () => {
    const { onAnswer } = renderExercise(exercise, { disabled: true });
    await userEvent.click(screen.getByRole("radio", { name: /hola/i }));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("reveals the right option after an incorrect answer using the backend's solution text", () => {
    renderExercise(exercise, { verdict: "incorrect", correctAnswer: "Hola", disabled: true });
    expect(screen.getByRole("radio", { name: /hola/i }).className).toContain("is-reveal");
  });
});

describe("TranslateExercise (word bank)", () => {
  const exercise: Exercise = { ...base, type: "translate", payload: { source_text: "I am Ana", direction: "to_target", tokens: ["soy", "Yo", "Ana", "es"] } };
  const bank = () => screen.getByRole("group", { name: /word bank/i });

  it("builds the answer in tap order and reports tokens", async () => {
    const { onAnswer } = renderExercise(exercise);
    for (const word of ["Yo", "soy", "Ana"]) await userEvent.click(screen.getByRole("button", { name: word }));
    expect(onAnswer).toHaveBeenLastCalledWith({ tokens: ["Yo", "soy", "Ana"] });
    expect(bank().querySelectorAll(".is-used")).toHaveLength(3);
  });

  it("lets the learner remove a word and reports null when empty", async () => {
    const { onAnswer } = renderExercise(exercise);
    await userEvent.click(screen.getByRole("button", { name: "Yo" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove Yo" }));
    expect(onAnswer).toHaveBeenLastCalledWith(null);
  });

  it("handles duplicate words independently", async () => {
    const dup: Exercise = { ...base, type: "translate", payload: { source_text: "x", direction: "to_target", tokens: ["la", "la", "casa"] } };
    const { onAnswer } = renderExercise(dup);
    const las = screen.getAllByRole("button", { name: "la" });
    await userEvent.click(las[0]);
    await userEvent.click(las[1]);
    expect(onAnswer).toHaveBeenLastCalledWith({ tokens: ["la", "la"] });
  });
});

describe("FillBlankExercise", () => {
  const exercise: Exercise = { ...base, type: "fill_blank", payload: { before: "Yo ", after: " Ana.", options: ["soy", "eres"], hint: "I am Ana." } };

  it("fills the blank and reports the text; clicking the blank clears it", async () => {
    const { onAnswer } = renderExercise(exercise);
    await userEvent.click(screen.getByRole("button", { name: "soy" }));
    expect(onAnswer).toHaveBeenLastCalledWith({ text: "soy" });
    await userEvent.click(screen.getByRole("button", { name: /blank filled with soy/i }));
    expect(onAnswer).toHaveBeenLastCalledWith(null);
  });
});

describe("TypeAnswerExercise", () => {
  const exercise: Exercise = { ...base, type: "type_answer", payload: { source_text: "water", direction: "to_target" } };

  it("reports typed text and null when blank", async () => {
    const { onAnswer } = renderExercise(exercise);
    const input = screen.getByRole("textbox", { name: /your answer/i });
    await userEvent.type(input, "agua");
    expect(onAnswer).toHaveBeenLastCalledWith({ text: "agua" });
    await userEvent.clear(input);
    expect(onAnswer).toHaveBeenLastCalledWith(null);
  });
});

describe("MatchPairsExercise", () => {
  const exercise: Exercise = {
    ...base,
    type: "match_pairs",
    payload: { left: [{ id: "l0", text: "hola" }, { id: "l1", text: "adiós" }], right: [{ id: "r1", text: "bye" }, { id: "r0", text: "hello" }] },
  };

  it("asks the backend about each pair and reports all pairs once everything is matched", async () => {
    const { onAnswer, checkPair } = renderExercise(exercise);
    await userEvent.click(screen.getByRole("button", { name: "hola" }));
    await userEvent.click(screen.getByRole("button", { name: "hello" }));
    await waitFor(() => expect(screen.getByText(/1 of 2 pairs matched/i)).toBeInTheDocument());
    expect(checkPair).toHaveBeenCalledWith(1, "l0", "r0");
    expect(onAnswer).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "adiós" }));
    await userEvent.click(screen.getByRole("button", { name: "bye" }));
    await waitFor(() =>
      expect(onAnswer).toHaveBeenCalledWith({ pairs: [{ left_id: "l0", right_id: "r0" }, { left_id: "l1", right_id: "r1" }] }),
    );
  });

  it("flashes an invalid pair without matching it", async () => {
    const checkPair = vi.fn().mockResolvedValue(false);
    const { onAnswer } = renderExercise(exercise, { checkPair });
    await userEvent.click(screen.getByRole("button", { name: "hola" }));
    await userEvent.click(screen.getByRole("button", { name: "bye" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "hola" }).className).toContain("is-wrong"));
    expect(screen.getByText(/0 of 2 pairs matched/i)).toBeInTheDocument();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("surfaces a network failure instead of getting stuck", async () => {
    const checkPair = vi.fn().mockRejectedValue(new Error("offline"));
    renderExercise(exercise, { checkPair });
    await userEvent.click(screen.getByRole("button", { name: "hola" }));
    await userEvent.click(screen.getByRole("button", { name: "hello" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("offline");
  });
});

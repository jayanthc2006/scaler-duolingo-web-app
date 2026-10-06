import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FeedbackBar } from "@/components/lesson/FeedbackBar";
import type { AnswerResult, Learner } from "@/lib/types/api";

const learner = { hearts: 4 } as Learner;
const result = (over: Partial<AnswerResult>): AnswerResult => ({
  correct: true, already_solved: false, xp_awarded: 2, heart_lost: false, out_of_hearts: false,
  correct_answer: null, explanation: null, learner, ...over,
});
const props = { canCheck: true, notice: null, praiseSeed: 0, onCheck: vi.fn(), onContinue: vi.fn() };

describe("FeedbackBar", () => {
  it("disables Check until there is an answer", () => {
    render(<FeedbackBar {...props} phase="question" canCheck={false} result={null} />);
    expect(screen.getByRole("button", { name: "Check" })).toBeDisabled();
  });

  it("submits via Check", async () => {
    const onCheck = vi.fn();
    render(<FeedbackBar {...props} onCheck={onCheck} phase="question" result={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(onCheck).toHaveBeenCalledOnce();
  });

  it("shows a busy, disabled button while the backend is checking", () => {
    render(<FeedbackBar {...props} phase="checking" result={null} />);
    expect(screen.getByRole("button", { name: /checking/i })).toBeDisabled();
  });

  it("celebrates a correct answer with XP and a Continue button", async () => {
    const onContinue = vi.fn();
    render(<FeedbackBar {...props} onContinue={onContinue} phase="feedback" result={result({})} />);
    expect(screen.getByRole("status")).toHaveTextContent(/great job/i);
    expect(screen.getByLabelText("Plus 2 XP")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("shows the correction and heart loss for an incorrect answer (text, not colour alone)", () => {
    render(<FeedbackBar {...props} phase="feedback" result={result({ correct: false, heart_lost: true, correct_answer: "Me llamo Ana", xp_awarded: 0 })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Not quite");
    expect(screen.getByRole("status")).toHaveTextContent("Correct answer: Me llamo Ana");
    expect(screen.getByRole("status")).toHaveTextContent("You lost a heart");
  });

  it("announces being out of hearts", () => {
    const empty = { hearts: 0 } as Learner;
    render(<FeedbackBar {...props} phase="feedback" result={result({ correct: false, heart_lost: true, out_of_hearts: true, learner: empty, correct_answer: "x" })} />);
    expect(screen.getByRole("status")).toHaveTextContent(/out of hearts/i);
  });

  it("shows request failures as an alert", () => {
    render(<FeedbackBar {...props} phase="question" result={null} notice="Can't reach the server." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Can't reach the server.");
  });
});

"use client";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { SpeakButton } from "@/components/ui/SpeakButton";
import type { AnswerResult } from "@/lib/types/api";

const PRAISE = ["Great job!", "Nice work!", "Awesome!", "Correct!", "You got it!", "Perfect!"];

interface Props {
  phase: "question" | "checking" | "feedback";
  canCheck: boolean;
  result: AnswerResult | null;
  notice: string | null;
  praiseSeed: number;
  /** Spanish text of the finished answer; adds a listen button to the feedback banner. */
  listen?: string | null;
  onCheck: () => void;
  onContinue: () => void;
}

/** Bottom bar: Check button while answering, green/red banner + Continue after the backend replies. */
export function FeedbackBar({ phase, canCheck, result, notice, praiseSeed, listen, onCheck, onContinue }: Props) {
  const showing = phase === "feedback" && result;
  const correct = showing && result.correct;

  return (
    <footer className={`lesson-footer${showing ? (correct ? " is-correct" : " is-incorrect") : ""}`}>
      <div className="footer-inner">
        {showing ? (
          <>
            <div className="feedback" role="status" aria-live="polite">
              <span className={`feedback-icon ${correct ? "is-correct" : "is-incorrect"}`} aria-hidden>
                <Icon name={correct ? "check" : "x"} size={34} />
              </span>
              <div className="feedback-text">
                <p className="feedback-title">{correct ? PRAISE[praiseSeed % PRAISE.length] : "Not quite"}</p>
                {!correct && result.correct_answer && (
                  <p className="feedback-detail">
                    <span className="feedback-label">Correct answer:</span> {result.correct_answer}
                  </p>
                )}
                {result.explanation && <p className="feedback-detail">{result.explanation}</p>}
                {!correct && result.heart_lost && (
                  <p className="feedback-detail feedback-heart">
                    <Icon name="heart" size={16} /> {result.learner.hearts === 0 ? "You're out of hearts" : "You lost a heart"}
                  </p>
                )}
              </div>
              {listen && <SpeakButton text={listen} />}
              {correct && result.xp_awarded > 0 && <span className="xp-float" aria-label={`Plus ${result.xp_awarded} XP`}>+{result.xp_awarded} XP</span>}
            </div>
            <Button variant={correct ? "primary" : "red"} className="footer-btn" onClick={onContinue} data-primary-action autoFocus>
              Continue
            </Button>
          </>
        ) : (
          <>
            <p className="footer-notice" role={notice ? "alert" : undefined}>{notice}</p>
            <Button className="footer-btn" disabled={!canCheck || phase === "checking"} onClick={onCheck} data-primary-action aria-busy={phase === "checking"}>
              {phase === "checking" ? "Checking..." : "Check"}
            </Button>
          </>
        )}
      </div>
    </footer>
  );
}

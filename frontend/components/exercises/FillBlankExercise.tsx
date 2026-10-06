"use client";

import { useState } from "react";
import type { ExerciseViewProps } from "@/components/exercises/types";
import type { FillBlankPayload } from "@/lib/types/api";

export function FillBlankExercise({ payload, disabled, verdict, onAnswer }: ExerciseViewProps<FillBlankPayload>) {
  const [choice, setChoice] = useState<string | null>(null);

  const pick = (option: string) => {
    if (disabled) return;
    setChoice(option);
    onAnswer({ text: option });
  };

  return (
    <div className="exercise-body">
      <p className="sentence">
        <span>{payload.before}</span>
        <button
          type="button"
          className={`blank${choice ? " is-filled" : ""}${verdict ? ` is-${verdict}` : ""}`}
          onClick={() => !disabled && choice && (setChoice(null), onAnswer(null))}
          disabled={disabled || !choice}
          aria-label={choice ? `Blank filled with ${choice}. Press to clear.` : "Blank"}
        >
          {choice ?? " "}
        </button>
        <span>{payload.after}</span>
      </p>
      <p className="hint">{payload.hint}</p>
      <div className="wb-bank" role="group" aria-label="Choose the missing word">
        {payload.options.map((option) => (
          <button key={option} type="button" className={`chip${choice === option ? " is-used" : ""}`} onClick={() => pick(option)} disabled={disabled}>
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

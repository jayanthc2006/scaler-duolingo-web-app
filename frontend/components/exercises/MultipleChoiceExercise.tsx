"use client";

import { useEffect, useState } from "react";
import type { ExerciseViewProps } from "@/components/exercises/types";
import type { MultipleChoicePayload } from "@/lib/types/api";

export function MultipleChoiceExercise({ payload, disabled, verdict, correctAnswer, onAnswer }: ExerciseViewProps<MultipleChoicePayload>) {
  const [selected, setSelected] = useState<string | null>(null);

  const choose = (id: string) => {
    if (disabled) return;
    setSelected(id);
    onAnswer({ option_id: id });
  };

  // number keys 1..n pick an option
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      const index = Number(e.key) - 1;
      const option = payload.options[index];
      if (option && !e.metaKey && !e.ctrlKey && !e.altKey) {
        setSelected(option.id);
        onAnswer({ option_id: option.id });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, payload.options, onAnswer]);

  return (
    <div className="choice-list" role="radiogroup" aria-label="Answer options">
      {payload.options.map((option, i) => {
        const isSelected = selected === option.id;
        const isRevealedCorrect = verdict === "incorrect" && option.text === correctAnswer;
        const state = verdict && isSelected ? verdict : isRevealedCorrect ? "reveal" : isSelected ? "selected" : "";
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            className={`choice ${state ? `is-${state}` : ""}`}
            onClick={() => choose(option.id)}
          >
            <span className="choice-key" aria-hidden>{i + 1}</span>
            <span className="choice-text">{option.text}</span>
          </button>
        );
      })}
    </div>
  );
}

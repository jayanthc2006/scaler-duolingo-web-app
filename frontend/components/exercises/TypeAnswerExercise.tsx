"use client";

import { useEffect, useRef, useState } from "react";
import { PromptBubble } from "@/components/exercises/PromptBubble";
import type { ExerciseViewProps } from "@/components/exercises/types";
import type { TypeAnswerPayload } from "@/lib/types/api";

export function TypeAnswerExercise({ payload, disabled, verdict, onAnswer }: ExerciseViewProps<TypeAnswerPayload>) {
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  return (
    <div className="exercise-body">
      <PromptBubble text={payload.source_text} speak={payload.direction === "to_source"} />
      <input
        ref={input}
        className={`type-input${verdict ? ` is-${verdict}` : ""}`}
        value={value}
        disabled={disabled}
        lang={payload.direction === "to_target" ? "es" : "en"}
        placeholder={payload.direction === "to_target" ? "Type in Spanish" : "Type in English"}
        aria-label="Your answer"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(e) => {
          setValue(e.target.value);
          onAnswer(e.target.value.trim() ? { text: e.target.value } : null);
        }}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import { PromptBubble } from "@/components/exercises/PromptBubble";
import { WordBank } from "@/components/exercises/WordBank";
import type { ExerciseViewProps } from "@/components/exercises/types";
import type { TranslatePayload } from "@/lib/types/api";

export function TranslateExercise({ payload, disabled, verdict, onAnswer }: ExerciseViewProps<TranslatePayload>) {
  const [selected, setSelected] = useState<number[]>([]);

  const change = (next: number[]) => {
    setSelected(next);
    onAnswer(next.length ? { tokens: next.map((i) => payload.tokens[i]) } : null);
  };

  return (
    <div className="exercise-body">
      <PromptBubble text={payload.source_text} speak={payload.direction === "to_source"} />
      <WordBank tokens={payload.tokens} selected={selected} onChange={change} disabled={disabled} verdict={verdict} />
    </div>
  );
}

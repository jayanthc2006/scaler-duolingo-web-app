"use client";

import { FillBlankExercise } from "@/components/exercises/FillBlankExercise";
import { MatchPairsExercise } from "@/components/exercises/MatchPairsExercise";
import { MultipleChoiceExercise } from "@/components/exercises/MultipleChoiceExercise";
import { TranslateExercise } from "@/components/exercises/TranslateExercise";
import { TypeAnswerExercise } from "@/components/exercises/TypeAnswerExercise";
import type { Verdict } from "@/components/exercises/types";
import { SpeakButton } from "@/components/ui/SpeakButton";
import { promptSpeech } from "@/lib/audio/speakable";
import type { AnswerPayload, Exercise } from "@/lib/types/api";

interface Props {
  exercise: Exercise;
  disabled: boolean;
  verdict: Verdict;
  correctAnswer: string | null;
  onAnswer: (answer: AnswerPayload | null) => void;
  checkPair: (exerciseId: number, leftId: string, rightId: string) => Promise<boolean>;
}

/** Single dispatch point: picks the component for `exercise.type`. Adding a type = one case here. */
export function ExerciseRenderer({ exercise, checkPair, ...view }: Props) {
  switch (exercise.type) {
    case "multiple_choice": {
      const listen = promptSpeech(exercise);
      return (
        <>
          {listen && (
            <div className="audio-row">
              <SpeakButton text={listen} label="Listen" />
            </div>
          )}
          <MultipleChoiceExercise payload={exercise.payload} {...view} />
        </>
      );
    }
    case "translate":
      return <TranslateExercise payload={exercise.payload} {...view} />;
    case "match_pairs":
      return <MatchPairsExercise payload={exercise.payload} {...view} checkPair={(l, r) => checkPair(exercise.id, l, r)} />;
    case "fill_blank":
      return <FillBlankExercise payload={exercise.payload} {...view} />;
    case "type_answer":
      return <TypeAnswerExercise payload={exercise.payload} {...view} />;
  }
}

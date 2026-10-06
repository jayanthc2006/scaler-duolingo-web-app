"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ExerciseRenderer } from "@/components/exercises/ExerciseRenderer";
import { FeedbackBar } from "@/components/lesson/FeedbackBar";
import { LessonComplete } from "@/components/lesson/LessonComplete";
import { LessonHeader } from "@/components/lesson/LessonHeader";
import { OutOfHeartsModal } from "@/components/modals/OutOfHeartsModal";
import { QuitLessonModal } from "@/components/modals/QuitLessonModal";
import { TimesUpModal } from "@/components/modals/TimesUpModal";
import { useToast } from "@/components/ui/Toast";
import { ErrorState, LoadingState } from "@/components/ui/StateBox";
import { useDeadline } from "@/lib/hooks/useDeadline";
import { useLearner } from "@/lib/learner/LearnerContext";
import { answerSpeech } from "@/lib/audio/speakable";
import { currentExercise, progressFraction } from "@/lib/lesson/lessonMachine";
import { useLessonSession } from "@/lib/lesson/useLessonSession";
import type { AttemptKind } from "@/lib/types/api";

export function LessonScreen({ lessonId, kind }: { lessonId: number; kind: AttemptKind }) {
  const router = useRouter();
  const { learner: sharedLearner } = useLearner();
  const { state, setDraft, submit, checkPair, continueLesson, retry, refillHearts } = useLessonSession(lessonId, kind);
  const toast = useToast();
  const [quitOpen, setQuitOpen] = useState(false);
  const { phase } = state;
  const exercise = currentExercise(state);
  const result = phase.name === "feedback" ? phase.result : null;
  const legendary = kind === "legendary";
  // the server owns the deadline; this clock only drives the display and the time's-up screen
  const clockMs = useDeadline(legendary ? (state.attempt?.seconds_left ?? null) : null);
  const timeUp = legendary && clockMs === 0 && phase.name !== "complete";
  const quit = useCallback(() => router.push(legendary ? "/legendary" : "/"), [router, legendary]);

  // Enter = Check / Continue, like the real thing. Native clicks on the primary button are left alone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || quitOpen || timeUp || e.repeat) return;
      if ((e.target as HTMLElement | null)?.closest("[data-primary-action]")) return;
      if (phase.name === "feedback") {
        e.preventDefault();
        continueLesson();
      } else if (phase.name === "question" && state.draft) {
        e.preventDefault();
        void submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase.name, state.draft, quitOpen, timeUp, continueLesson, submit]);

  if (phase.name === "complete" && state.attempt) {
    return <LessonComplete result={phase.result} total={state.attempt.exercises.length} />;
  }
  if (phase.name === "error") return <ErrorState message={phase.message} onRetry={retry} />;
  if (phase.name === "loading") return <LoadingState label="Getting your lesson ready..." />;

  const practice = kind === "practice";
  const stage = phase.name === "checking" ? "checking" : phase.name === "feedback" ? "feedback" : "question";

  return (
    <div className="lesson">
      <LessonHeader
        progress={progressFraction(state)}
        hearts={(state.learner ?? sharedLearner)?.hearts ?? 0}
        heartLost={!!result?.heart_lost}
        practice={practice}
        clockMs={legendary ? clockMs : undefined}
        onClose={() => setQuitOpen(true)}
      />
      <main className="lesson-main" id="main">
        {exercise ? (
          <div className="lesson-stage" key={`${exercise.id}-${state.step}`}>
            <h1 className="lesson-prompt">{exercise.prompt}</h1>
            <div className={result && !result.correct ? "shake" : result?.correct ? "bounce" : undefined}>
              <ExerciseRenderer
                exercise={exercise}
                disabled={stage !== "question" || timeUp}
                verdict={result ? (result.correct ? "correct" : "incorrect") : null}
                correctAnswer={result?.correct_answer ?? null}
                onAnswer={setDraft}
                checkPair={checkPair}
              />
            </div>
          </div>
        ) : phase.name === "completing" ? (
          <LoadingState label="Wrapping up..." />
        ) : null}
      </main>
      {exercise && (
        <FeedbackBar
          phase={stage}
          canCheck={state.draft !== null && !timeUp}
          result={result}
          notice={state.notice}
          praiseSeed={state.solvedCount}
          listen={answerSpeech(exercise, state.draft, result)}
          onCheck={() => void submit()}
          onContinue={continueLesson}
        />
      )}

      {phase.name === "out_of_hearts" && (
        <OutOfHeartsModal
          onRefill={async () => {
            await refillHearts();
            toast("Hearts refilled!");
          }}
          onQuit={quit}
          onPractice={(id) => router.push(`/lesson/${id}?mode=practice`)}
        />
      )}
      {timeUp && <TimesUpModal onRetry={() => router.replace(`/legendary/play?run=${Date.now()}`)} onQuit={quit} />}
      {quitOpen && !timeUp && <QuitLessonModal onStay={() => setQuitOpen(false)} onQuit={quit} />}
    </div>
  );
}

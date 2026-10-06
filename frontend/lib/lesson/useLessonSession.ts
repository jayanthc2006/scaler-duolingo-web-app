"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { api } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { useLearner } from "@/lib/learner/LearnerContext";
import { currentExercise, initialLessonState, lessonReducer } from "@/lib/lesson/lessonMachine";
import type { AnswerPayload, AttemptKind } from "@/lib/types/api";

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const isOutOfHearts = (e: unknown) => e instanceof ApiError && e.code === "out_of_hearts";

/** Wires the pure lesson reducer to the backend. All I/O for a lesson lives here. */
export function useLessonSession(lessonId: number, kind: AttemptKind) {
  const [state, dispatch] = useReducer(lessonReducer, initialLessonState);
  const { setLearner } = useLearner();
  const lastRequest = useRef<{ key: string; id: string } | null>(null);
  const phaseName = state.phase.name;
  const attemptId = state.attempt?.attempt_id;

  // loading -> question
  useEffect(() => {
    if (phaseName !== "loading") return;
    let cancelled = false;
    api.startAttempt(lessonId, kind).then(
      (attempt) => {
        if (cancelled) return;
        dispatch({ type: "LOADED", attempt });
        setLearner(attempt.learner);
      },
      (e: unknown) => !cancelled && dispatch({ type: "LOAD_FAILED", message: messageOf(e), outOfHearts: isOutOfHearts(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [phaseName, lessonId, kind, setLearner]);

  // completing -> complete (server re-verifies that every exercise was solved)
  useEffect(() => {
    if (phaseName !== "completing" || attemptId === undefined) return;
    let cancelled = false;
    api.completeLesson(lessonId, attemptId).then(
      (result) => {
        if (cancelled) return;
        dispatch({ type: "COMPLETE_OK", result });
        setLearner(result.learner);
      },
      (e: unknown) => !cancelled && dispatch({ type: "COMPLETE_FAILED", message: messageOf(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [phaseName, lessonId, attemptId, setLearner]);

  const setDraft = useCallback((answer: AnswerPayload | null) => dispatch({ type: "DRAFT", answer }), []);

  const submit = useCallback(async () => {
    const exercise = currentExercise(state);
    if (state.phase.name !== "question" || !exercise || !state.draft || state.attempt === null) return;
    // Re-sending the *same* answer after a network failure reuses the idempotency key,
    // so a lost response can never cost a second heart.
    const key = `${exercise.id}:${JSON.stringify(state.draft)}`;
    const requestId = lastRequest.current?.key === key ? lastRequest.current.id : crypto.randomUUID();
    lastRequest.current = { key, id: requestId };
    dispatch({ type: "SUBMIT" });
    try {
      const result = await api.submitAnswer(exercise.id, state.attempt.attempt_id, requestId, state.draft);
      lastRequest.current = null;
      dispatch({ type: "ANSWER_OK", result });
      setLearner(result.learner);
    } catch (e) {
      dispatch({ type: "ANSWER_FAILED", message: messageOf(e), outOfHearts: isOutOfHearts(e) });
    }
  }, [state, setLearner]);

  const checkPair = useCallback(
    async (exerciseId: number, left: string, right: string) => (await api.checkPair(exerciseId, left, right)).match,
    [],
  );

  const continueLesson = useCallback(() => dispatch({ type: "CONTINUE" }), []);
  const retry = useCallback(() => dispatch({ type: "RETRY" }), []);

  const refillHearts = useCallback(async () => {
    const { learner } = await api.refillHearts();
    setLearner(learner);
    dispatch({ type: "HEARTS_RESTORED", learner });
  }, [setLearner]);

  return { state, setDraft, submit, checkPair, continueLesson, retry, refillHearts };
}

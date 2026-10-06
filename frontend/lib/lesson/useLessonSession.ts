"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { playSfx } from "@/lib/audio/sfx";
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
  const submitting = useRef(false);
  const completionSounded = useRef(false);
  // legendary only: the server's authoritative time left, refreshed by every judged answer (a wrong one costs time there)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const phaseName = state.phase.name;
  const attemptId = state.attempt?.attempt_id;
  const attemptLessonId = state.attempt?.lesson_id ?? lessonId;

  // loading -> question
  useEffect(() => {
    if (phaseName !== "loading") return;
    let cancelled = false;
    // a legendary run is started by its own endpoint: the server picks the lesson and owns the clock
    (kind === "legendary" ? api.startLegendary() : api.startAttempt(lessonId, kind)).then(
      (attempt) => {
        if (cancelled) return;
        dispatch({ type: "LOADED", attempt });
        setLearner(attempt.learner);
        setSecondsLeft(attempt.seconds_left ?? null);
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
    api.completeLesson(attemptLessonId, attemptId).then(
      (result) => {
        if (cancelled) return;
        dispatch({ type: "COMPLETE_OK", result });
        setLearner(result.learner);
        if (!completionSounded.current) {
          completionSounded.current = true; // StrictMode runs this effect twice in dev; the cue must still play once
          playSfx("complete");
        }
      },
      (e: unknown) => !cancelled && dispatch({ type: "COMPLETE_FAILED", message: messageOf(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [phaseName, attemptLessonId, attemptId, setLearner]);

  const setDraft = useCallback((answer: AnswerPayload | null) => dispatch({ type: "DRAFT", answer }), []);

  const submit = useCallback(async () => {
    const exercise = currentExercise(state);
    if (state.phase.name !== "question" || !exercise || !state.draft || state.attempt === null) return;
    // Re-sending the *same* answer after a network failure reuses the idempotency key,
    // so a lost response can never cost a second heart.
    const key = `${exercise.id}:${JSON.stringify(state.draft)}`;
    const requestId = lastRequest.current?.key === key ? lastRequest.current.id : crypto.randomUUID();
    lastRequest.current = { key, id: requestId };
    if (submitting.current) return; // a second Check before the first answer is judged must not send (or sound) twice
    submitting.current = true;
    dispatch({ type: "SUBMIT" });
    try {
      const result = await api.submitAnswer(exercise.id, state.attempt.attempt_id, requestId, state.draft);
      lastRequest.current = null;
      dispatch({ type: "ANSWER_OK", result });
      setLearner(result.learner);
      if (result.seconds_left != null) setSecondsLeft(result.seconds_left); // follow the server's clock, penalties included
      if (!result.already_solved) playSfx(result.correct ? "correct" : "wrong"); // one cue per judged answer
    } catch (e) {
      dispatch({ type: "ANSWER_FAILED", message: messageOf(e), outOfHearts: isOutOfHearts(e) });
    } finally {
      submitting.current = false;
    }
  }, [state, setLearner]);

  // One request id per pair attempt: re-sending the *same* pair after a network failure is a replay, so a lost
  // response can never cost a second heart. A new tap after an answered attempt gets a fresh id.
  const lastPair = useRef<{ key: string; id: string } | null>(null);
  const checkPair = useCallback(
    async (exerciseId: number, left: string, right: string) => {
      if (attemptId === undefined) throw new Error("The lesson is not ready yet.");
      const key = `${exerciseId}:${left}:${right}`;
      const requestId = lastPair.current?.key === key ? lastPair.current.id : crypto.randomUUID();
      lastPair.current = { key, id: requestId };
      try {
        const result = await api.checkPair(exerciseId, attemptId, requestId, left, right);
        lastPair.current = null;
        setLearner(result.learner);
        if (result.seconds_left != null) setSecondsLeft(result.seconds_left);
        if (!result.match) playSfx("wrong"); // one cue per judged wrong pair (a replayed retry is answered once)
        if (result.heart_lost) dispatch({ type: "PAIR_MISS", learner: result.learner, outOfHearts: result.out_of_hearts });
        return result.match;
      } catch (e) {
        if (isOutOfHearts(e)) dispatch({ type: "PAIR_MISS", learner: null, outOfHearts: true });
        throw e;
      }
    },
    [attemptId, setLearner],
  );

  /** Explicit End Session in a legendary run: the server abandons the attempt (rejects on failure; nothing is assumed). */
  const endLegendary = useCallback(async () => {
    if (kind !== "legendary" || attemptId === undefined) return;
    await api.endLegendary(attemptId);
  }, [kind, attemptId]);

  const continueLesson = useCallback(() => dispatch({ type: "CONTINUE" }), []);
  const retry = useCallback(() => dispatch({ type: "RETRY" }), []);

  const refillHearts = useCallback(async () => {
    const { learner } = await api.refillHearts();
    setLearner(learner);
    dispatch({ type: "HEARTS_RESTORED", learner });
  }, [setLearner]);

  return { state, secondsLeft, setDraft, submit, checkPair, continueLesson, retry, refillHearts, endLegendary };
}

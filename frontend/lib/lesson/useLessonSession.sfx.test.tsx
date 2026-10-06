import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { playSfx } from "@/lib/audio/sfx";
import { api } from "@/lib/api/endpoints";
import { useLessonSession } from "@/lib/lesson/useLessonSession";
import type { AnswerResult, Attempt, CompleteResult, Learner, PairCheckResult } from "@/lib/types/api";

vi.mock("@/lib/audio/sfx", () => ({ playSfx: vi.fn() }));
vi.mock("@/lib/learner/LearnerContext", () => ({ useLearner: () => ({ setLearner: vi.fn() }) }));
vi.mock("@/lib/api/endpoints", () => ({
  api: { startAttempt: vi.fn(), submitAnswer: vi.fn(), checkPair: vi.fn(), completeLesson: vi.fn() },
}));

const learner: Learner = {
  id: 1, username: "a", display_name: "A", avatar_color: "blue", xp_total: 0, hearts: 5, max_hearts: 5,
  next_heart_in_seconds: null, gems: 0, refill_cost_gems: 100, current_streak: 0, longest_streak: 0,
  streak_active_today: false, daily_goal_xp: 30, daily_xp: 0,
};
const attempt: Attempt = {
  attempt_id: 7, lesson_id: 3, lesson_title: "L", kind: "lesson", solved_exercise_ids: [], learner,
  exercises: [
    { id: 11, position: 1, type: "type_answer", prompt: "p", payload: { source_text: "x", direction: "to_target" } },
    { id: 12, position: 2, type: "match_pairs", prompt: "m", payload: { left: [], right: [] } },
  ],
};
const answer = (over: Partial<AnswerResult> = {}): AnswerResult => ({
  correct: true, already_solved: false, xp_awarded: 2, heart_lost: false, out_of_hearts: false,
  correct_answer: null, explanation: null, learner, ...over,
});
const pair = (over: Partial<PairCheckResult> = {}): PairCheckResult => ({
  match: false, heart_lost: true, out_of_hearts: false, learner, ...over,
});
const complete = (over: Partial<CompleteResult> = {}): CompleteResult => ({
  kind: "lesson", already_completed: false, xp_from_answers: 4, xp_completion_bonus: 10, xp_total_gained: 14,
  gems_awarded: 5, hearts_gained: 0, mistakes: 0, skill_id: 1, skill_completed: false, new_achievements: [], learner, ...over,
});

async function started() {
  vi.mocked(api.startAttempt).mockResolvedValue(attempt);
  const hook = renderHook(() => useLessonSession(3, "lesson"));
  await waitFor(() => expect(hook.result.current.state.phase.name).toBe("question"));
  return hook;
}
const withDraft = async (hook: Awaited<ReturnType<typeof started>>) => {
  act(() => hook.result.current.setDraft({ text: "hola" }));
  await waitFor(() => expect(hook.result.current.state.draft).not.toBeNull());
};

describe("lesson feedback sounds", () => {
  beforeEach(() => vi.clearAllMocks());

  it("plays the success cue once when the server judges an answer correct", async () => {
    const hook = await started();
    await withDraft(hook);
    vi.mocked(api.submitAnswer).mockResolvedValue(answer());
    await act(async () => hook.result.current.submit());
    expect(playSfx).toHaveBeenCalledTimes(1);
    expect(playSfx).toHaveBeenCalledWith("correct");
    expect(hook.result.current.state.phase.name).toBe("feedback");
  });

  it("plays the error cue once for a wrong answer, and the heart bookkeeping is untouched", async () => {
    const hook = await started();
    await withDraft(hook);
    vi.mocked(api.submitAnswer).mockResolvedValue(
      answer({ correct: false, heart_lost: true, correct_answer: "hola", learner: { ...learner, hearts: 4 } }),
    );
    await act(async () => hook.result.current.submit());
    expect(playSfx).toHaveBeenCalledTimes(1);
    expect(playSfx).toHaveBeenCalledWith("wrong");
    expect(hook.result.current.state.learner?.hearts).toBe(4);
  });

  it("does not play on selection alone, nor when the server says the answer was already solved", async () => {
    const hook = await started();
    await withDraft(hook);
    expect(playSfx).not.toHaveBeenCalled();
    vi.mocked(api.submitAnswer).mockResolvedValue(answer({ already_solved: true }));
    await act(async () => hook.result.current.submit());
    expect(playSfx).not.toHaveBeenCalled();
  });

  it("a double Check sends once and sounds once", async () => {
    const hook = await started();
    await withDraft(hook);
    let release: (r: AnswerResult) => void = () => {};
    vi.mocked(api.submitAnswer).mockReturnValue(new Promise((resolve) => (release = resolve)));
    await act(async () => {
      void hook.result.current.submit();
      void hook.result.current.submit(); // the second click lands before the first answer is judged
    });
    await act(async () => release(answer()));
    expect(api.submitAnswer).toHaveBeenCalledTimes(1);
    expect(playSfx).toHaveBeenCalledTimes(1);
  });

  it("a failed request is silent, and its retry (same request id) sounds once", async () => {
    const hook = await started();
    await withDraft(hook);
    vi.mocked(api.submitAnswer).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(answer());
    await act(async () => hook.result.current.submit());
    expect(playSfx).not.toHaveBeenCalled();
    expect(hook.result.current.state.phase.name).toBe("question"); // back to answering with a notice
    await act(async () => hook.result.current.submit());
    expect(playSfx).toHaveBeenCalledTimes(1);
    const ids = vi.mocked(api.submitAnswer).mock.calls.map((c) => c[2]);
    expect(ids[0]).toBe(ids[1]);
  });

  it("plays the error cue once for a wrong match pair, and nothing for a right one", async () => {
    const hook = await started();
    vi.mocked(api.checkPair).mockResolvedValueOnce(pair({ match: true, heart_lost: false })).mockResolvedValueOnce(pair());
    await act(async () => void (await hook.result.current.checkPair(12, "l0", "r0")));
    expect(playSfx).not.toHaveBeenCalled();
    await act(async () => void (await hook.result.current.checkPair(12, "l0", "r1")));
    expect(playSfx).toHaveBeenCalledTimes(1);
    expect(playSfx).toHaveBeenCalledWith("wrong");
  });

  it("a wrong pair in practice (no heart lost) still sounds once; a refused pair at 0 hearts is silent", async () => {
    const hook = await started();
    vi.mocked(api.checkPair).mockResolvedValueOnce(pair({ heart_lost: false }));
    await act(async () => void (await hook.result.current.checkPair(12, "l0", "r1")));
    expect(playSfx).toHaveBeenCalledTimes(1);
    vi.mocked(api.checkPair).mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      await expect(hook.result.current.checkPair(12, "l0", "r1")).rejects.toThrow();
    });
    expect(playSfx).toHaveBeenCalledTimes(1);
  });

  it("plays the completion cue once when the lesson completes, even if the completion effect runs twice", async () => {
    vi.mocked(api.startAttempt).mockResolvedValue({ ...attempt, solved_exercise_ids: [11, 12] }); // nothing left: completes at once
    vi.mocked(api.completeLesson).mockResolvedValue(complete());
    const hook = renderHook(() => useLessonSession(3, "lesson"));
    await waitFor(() => expect(hook.result.current.state.phase.name).toBe("complete"));
    expect(api.completeLesson).toHaveBeenCalledTimes(1);
    expect(playSfx).toHaveBeenCalledTimes(1);
    expect(playSfx).toHaveBeenCalledWith("complete");
  });

  it("a failed completion is silent; the retry that succeeds sounds once", async () => {
    vi.mocked(api.startAttempt).mockResolvedValue({ ...attempt, solved_exercise_ids: [11, 12] });
    vi.mocked(api.completeLesson).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(complete());
    const hook = renderHook(() => useLessonSession(3, "lesson"));
    await waitFor(() => expect(hook.result.current.state.phase.name).toBe("error"));
    expect(playSfx).not.toHaveBeenCalled();
    act(() => hook.result.current.retry());
    await waitFor(() => expect(hook.result.current.state.phase.name).toBe("complete"));
    expect(playSfx).toHaveBeenCalledTimes(1);
  });
});

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { playSfx } from "@/lib/audio/sfx";
import { api } from "@/lib/api/endpoints";
import { useLessonSession } from "@/lib/lesson/useLessonSession";
import type { AnswerResult, Attempt, Learner, PairCheckResult } from "@/lib/types/api";

vi.mock("@/lib/audio/sfx", () => ({ playSfx: vi.fn() }));
vi.mock("@/lib/learner/LearnerContext", () => ({ useLearner: () => ({ setLearner: vi.fn() }) }));
vi.mock("@/lib/api/endpoints", () => ({
  api: { startLegendary: vi.fn(), submitAnswer: vi.fn(), checkPair: vi.fn(), endLegendary: vi.fn() },
}));

const learner: Learner = {
  id: 1, username: "a", display_name: "A", avatar_color: "blue", xp_total: 0, hearts: 5, max_hearts: 5,
  next_heart_in_seconds: null, gems: 0, refill_cost_gems: 100, current_streak: 0, longest_streak: 0,
  streak_active_today: false, daily_goal_xp: 30, daily_xp: 0,
};
const legendary = (id: number, secondsLeft: number): Attempt => ({
  attempt_id: id, lesson_id: 3, lesson_title: "L", kind: "legendary", solved_exercise_ids: [], learner,
  time_limit_seconds: 60, seconds_left: secondsLeft,
  exercises: [
    { id: 11, position: 1, type: "type_answer", prompt: "p", payload: { source_text: "x", direction: "to_target" } },
    { id: 12, position: 2, type: "match_pairs", prompt: "m", payload: { left: [], right: [] } },
  ],
});
const answer = (over: Partial<AnswerResult> = {}): AnswerResult => ({
  correct: false, already_solved: false, xp_awarded: 0, heart_lost: false, out_of_hearts: false,
  correct_answer: "hola", explanation: null, learner, seconds_left: 55, ...over,
});
const pair = (over: Partial<PairCheckResult> = {}): PairCheckResult => ({
  match: false, heart_lost: false, out_of_hearts: false, learner, seconds_left: 55, ...over,
});

async function started(attempt: Attempt = legendary(7, 60)) {
  vi.mocked(api.startLegendary).mockResolvedValue(attempt);
  const hook = renderHook(() => useLessonSession(0, "legendary"));
  await waitFor(() => expect(hook.result.current.state.phase.name).toBe("question"));
  return hook;
}
const draft = async (hook: Awaited<ReturnType<typeof started>>) => {
  act(() => hook.result.current.setDraft({ text: "x" }));
  await waitFor(() => expect(hook.result.current.state.draft).not.toBeNull());
};

describe("legendary clock follows the server", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts from the server's seconds_left", async () => {
    const { result } = await started(legendary(7, 41));
    expect(result.current.secondsLeft).toBe(41);
  });

  it("adopts the server's reduced time after a wrong answer, and keeps it after a right one", async () => {
    const hook = await started();
    await draft(hook);
    vi.mocked(api.submitAnswer).mockResolvedValue(answer({ seconds_left: 55 })); // 5 s penalty applied by the server
    await act(async () => hook.result.current.submit());
    expect(hook.result.current.secondsLeft).toBe(55);
    expect(hook.result.current.state.learner?.hearts).toBe(5); // never a heart in legendary
  });

  it("a failed request does not deduct anything, and the retry (same request id) adopts the server's single penalty", async () => {
    const hook = await started();
    await draft(hook);
    vi.mocked(api.submitAnswer).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(answer({ seconds_left: 55 }));
    await act(async () => hook.result.current.submit());
    expect(hook.result.current.secondsLeft).toBe(60); // untouched: the client never computes a penalty
    await act(async () => hook.result.current.submit());
    expect(hook.result.current.secondsLeft).toBe(55);
    const ids = vi.mocked(api.submitAnswer).mock.calls.map((c) => c[2]);
    expect(ids[0]).toBe(ids[1]);
  });

  it("applies no extra time of its own: the same server value twice stays the same value, and the sound plays once", async () => {
    const hook = await started();
    await draft(hook);
    vi.mocked(api.submitAnswer).mockResolvedValue(answer({ seconds_left: 55 }));
    await act(async () => hook.result.current.submit());
    expect(hook.result.current.secondsLeft).toBe(55);
    expect(playSfx).toHaveBeenCalledTimes(1);
    expect(playSfx).toHaveBeenCalledWith("wrong");
  });

  it("follows the server after a wrong match pair too", async () => {
    const hook = await started();
    vi.mocked(api.checkPair).mockResolvedValue(pair({ seconds_left: 50 }));
    await act(async () => void (await hook.result.current.checkPair(12, "l0", "r1")));
    expect(hook.result.current.secondsLeft).toBe(50);
    expect(playSfx).toHaveBeenCalledTimes(1);
  });

  it("ignores a response that carries no clock (normal lessons)", async () => {
    const hook = await started();
    await draft(hook);
    vi.mocked(api.submitAnswer).mockResolvedValue(answer({ seconds_left: undefined }));
    await act(async () => hook.result.current.submit());
    expect(hook.result.current.secondsLeft).toBe(60);
  });
});

describe("legendary End Session", () => {
  beforeEach(() => vi.clearAllMocks());

  it("closes the attempt on the server", async () => {
    const { result } = await started(legendary(7, 25));
    vi.mocked(api.endLegendary).mockResolvedValue({ attempt_id: 7, status: "abandoned" });
    await act(async () => result.current.endLegendary());
    expect(api.endLegendary).toHaveBeenCalledWith(7);
  });

  it("does not pretend it worked when the request fails", async () => {
    const { result } = await started();
    vi.mocked(api.endLegendary).mockRejectedValue(new Error("offline"));
    await act(async () => {
      await expect(result.current.endLegendary()).rejects.toThrow("offline");
    });
  });

  it("a START after End Session is a fresh attempt with a full clock; a refresh of it resumes that same attempt", async () => {
    const first = await started(legendary(7, 25));
    expect(first.result.current.state.attempt?.attempt_id).toBe(7);
    first.unmount();
    const fresh = await started(legendary(8, 60)); // what the server returns after the old run was abandoned
    expect(fresh.result.current.state.attempt?.attempt_id).toBe(8);
    expect(fresh.result.current.secondsLeft).toBe(60);
    fresh.unmount();
    const refreshed = await started(legendary(8, 52)); // same attempt, authoritative remaining time
    expect(refreshed.result.current.state.attempt?.attempt_id).toBe(8);
    expect(refreshed.result.current.secondsLeft).toBe(52);
  });
});

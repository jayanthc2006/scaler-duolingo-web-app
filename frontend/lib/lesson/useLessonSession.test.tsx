import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { api } from "@/lib/api/endpoints";
import { useLessonSession } from "@/lib/lesson/useLessonSession";
import type { Attempt, Learner, PairCheckResult } from "@/lib/types/api";

const setLearner = vi.fn();
vi.mock("@/lib/learner/LearnerContext", () => ({ useLearner: () => ({ setLearner }) }));
vi.mock("@/lib/api/endpoints", () => ({ api: { startAttempt: vi.fn(), checkPair: vi.fn() } }));

const learner = (hearts: number): Learner => ({
  id: 1, username: "a", display_name: "A", avatar_color: "blue", xp_total: 0, hearts, max_hearts: 5,
  next_heart_in_seconds: null, gems: 0, refill_cost_gems: 100, current_streak: 0, longest_streak: 0,
  streak_active_today: false, daily_goal_xp: 30, daily_xp: 0,
});
const attempt: Attempt = {
  attempt_id: 7, lesson_id: 3, lesson_title: "L", kind: "lesson", solved_exercise_ids: [], learner: learner(5),
  exercises: [{ id: 11, position: 1, type: "match_pairs", prompt: "Tap", payload: { left: [], right: [] } }],
};
const pair = (over: Partial<PairCheckResult>): PairCheckResult => ({
  match: false, heart_lost: true, out_of_hearts: false, learner: learner(4), ...over,
});

async function started() {
  vi.mocked(api.startAttempt).mockResolvedValue(attempt);
  const hook = renderHook(() => useLessonSession(3, "lesson"));
  await waitFor(() => expect(hook.result.current.state.phase.name).toBe("question"));
  return hook;
}

describe("useLessonSession.checkPair (match pairs)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends the attempt and an idempotency key, then adopts the server's hearts after a wrong pair", async () => {
    const { result } = await started();
    vi.mocked(api.checkPair).mockResolvedValue(pair({}));
    let match: boolean | undefined;
    await act(async () => {
      match = await result.current.checkPair(11, "l0", "r1");
    });
    expect(match).toBe(false);
    expect(api.checkPair).toHaveBeenCalledWith(11, 7, expect.any(String), "l0", "r1");
    expect(result.current.state.learner?.hearts).toBe(4);
    expect(setLearner).toHaveBeenCalledWith(expect.objectContaining({ hearts: 4 }));
    expect(result.current.state.phase.name).toBe("question"); // still playing
  });

  it("does not touch the lesson state for a correct pair", async () => {
    const { result } = await started();
    vi.mocked(api.checkPair).mockResolvedValue(pair({ match: true, heart_lost: false, learner: learner(5) }));
    await act(async () => {
      expect(await result.current.checkPair(11, "l0", "r0")).toBe(true);
    });
    expect(result.current.state.learner?.hearts).toBe(5);
    expect(result.current.state.phase.name).toBe("question");
  });

  it("moves into the out-of-hearts flow when the wrong pair takes the last heart", async () => {
    const { result } = await started();
    vi.mocked(api.checkPair).mockResolvedValue(pair({ out_of_hearts: true, learner: learner(0) }));
    await act(async () => {
      await result.current.checkPair(11, "l0", "r1");
    });
    expect(result.current.state.phase.name).toBe("out_of_hearts");
    expect(result.current.state.learner?.hearts).toBe(0);
  });

  it("treats a server out_of_hearts refusal the same way", async () => {
    const { result } = await started();
    vi.mocked(api.checkPair).mockRejectedValue(new ApiError(409, "out_of_hearts", "You are out of hearts."));
    await act(async () => {
      await expect(result.current.checkPair(11, "l0", "r1")).rejects.toThrow();
    });
    expect(result.current.state.phase.name).toBe("out_of_hearts");
    expect(result.current.state.learner?.hearts).toBe(0);
  });

  it("re-sends the SAME request id after a network failure, and a new one for the next tap", async () => {
    const { result } = await started();
    vi.mocked(api.checkPair).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(pair({}));
    await act(async () => {
      await expect(result.current.checkPair(11, "l0", "r1")).rejects.toThrow("offline");
    });
    await act(async () => {
      await result.current.checkPair(11, "l0", "r1"); // the learner taps the same pair again
    });
    await act(async () => {
      await result.current.checkPair(11, "l0", "r1"); // a brand new attempt after an answered one
    });
    const ids = vi.mocked(api.checkPair).mock.calls.map((c) => c[2]);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[1]);
  });
});

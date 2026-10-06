import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LessonScreen } from "@/components/lesson/LessonScreen";
import { api } from "@/lib/api/endpoints";
import type { Attempt, Learner } from "@/lib/types/api";

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => vi.fn() }));
vi.mock("@/lib/audio/sfx", () => ({ playSfx: vi.fn() }));
vi.mock("@/lib/api/endpoints", () => ({
  api: { startLegendary: vi.fn(), endLegendary: vi.fn(), submitAnswer: vi.fn(), checkPair: vi.fn(), completeLesson: vi.fn() },
}));

const learner: Learner = {
  id: 1, username: "a", display_name: "A", avatar_color: "blue", xp_total: 0, hearts: 5, max_hearts: 5,
  next_heart_in_seconds: null, gems: 0, refill_cost_gems: 100, current_streak: 0, longest_streak: 0,
  streak_active_today: false, daily_goal_xp: 30, daily_xp: 0,
};
vi.mock("@/lib/learner/LearnerContext", () => ({ useLearner: () => ({ learner, setLearner: vi.fn() }) }));

const run = (id: number, secondsLeft: number): Attempt => ({
  attempt_id: id, lesson_id: 3, lesson_title: "L", kind: "legendary", solved_exercise_ids: [], learner,
  time_limit_seconds: 60, seconds_left: secondsLeft,
  exercises: [{ id: 11, position: 1, type: "multiple_choice", prompt: "Pick one", payload: { options: [{ id: "a", text: "Hola" }] } }],
});

async function open(attempt = run(7, 60)) {
  vi.mocked(api.startLegendary).mockResolvedValue(attempt);
  render(<LessonScreen lessonId={0} kind="legendary" />);
  await screen.findByText("Pick one");
}

describe("LessonScreen (legendary)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the server clock in the header", async () => {
    await open(run(7, 41));
    await waitFor(() => expect(screen.getByRole("timer")).toHaveTextContent("0:41"));
    expect(screen.queryByText(/hearts left/i)).not.toBeInTheDocument();
  });

  it("End Session abandons the attempt on the server first, then returns to the hub", async () => {
    vi.mocked(api.endLegendary).mockResolvedValue({ attempt_id: 7, status: "abandoned" });
    await open();
    await userEvent.click(screen.getByRole("button", { name: /quit lesson/i }));
    expect(screen.getByRole("heading", { name: /end this challenge/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /end session/i }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/legendary"));
    expect(api.endLegendary).toHaveBeenCalledWith(7);
    expect(vi.mocked(api.endLegendary).mock.invocationCallOrder[0]).toBeLessThan(router.push.mock.invocationCallOrder[0]);
  });

  it("if ending fails it stays on the run, says so, and lets the learner retry", async () => {
    vi.mocked(api.endLegendary).mockRejectedValueOnce(new Error("Network error")).mockResolvedValue({ attempt_id: 7, status: "abandoned" });
    await open();
    await userEvent.click(screen.getByRole("button", { name: /quit lesson/i }));
    await userEvent.click(screen.getByRole("button", { name: /end session/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Network error");
    expect(router.push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/legendary"));
    expect(api.endLegendary).toHaveBeenCalledTimes(2);
  });

  it("Keep going closes the dialog without touching the server", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: /quit lesson/i }));
    await userEvent.click(screen.getByRole("button", { name: /keep going/i }));
    expect(api.endLegendary).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("time running out still shows Time's up, and Try again starts a new run", async () => {
    await open(run(7, 1));
    expect(await screen.findByRole("heading", { name: /time's up/i }, { timeout: 3000 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(router.replace).toHaveBeenCalledWith(expect.stringMatching(/^\/legendary\/play\?run=\d+$/));
    expect(api.endLegendary).not.toHaveBeenCalled(); // the server already closes a timed-out run when the next one starts
  });
});

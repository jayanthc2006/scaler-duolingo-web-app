import { request } from "@/lib/api/client";
import type {
  AnswerPayload,
  AnswerResult,
  Attempt,
  AttemptKind,
  CompleteResult,
  Course,
  Leaderboard,
  LegendaryStatus,
  Learner,
  Path,
  Profile,
  SkillDetail,
} from "@/lib/types/api";

export const api = {
  me: () => request<Learner>("/me"),
  profile: () => request<Profile>("/me/stats"),
  setDailyGoal: (daily_goal_xp: number) =>
    request<Learner>("/me/daily-goal", { method: "PATCH", body: { daily_goal_xp } }),

  courses: () => request<Course[]>("/courses"),
  path: (courseId: number) => request<Path>(`/courses/${courseId}/path`),
  skill: (skillId: number) => request<SkillDetail>(`/skills/${skillId}`),

  startAttempt: (lessonId: number, kind: AttemptKind) =>
    request<Attempt>(`/lessons/${lessonId}/attempts`, { method: "POST", body: { kind } }),
  submitAnswer: (exerciseId: number, attemptId: number, requestId: string, answer: AnswerPayload) =>
    request<AnswerResult>(`/exercises/${exerciseId}/answer`, {
      method: "POST",
      body: { attempt_id: attemptId, request_id: requestId, answer },
    }),
  checkPair: (exerciseId: number, leftId: string, rightId: string) =>
    request<{ match: boolean }>(`/exercises/${exerciseId}/check-pair`, {
      method: "POST",
      body: { left_id: leftId, right_id: rightId },
    }),
  completeLesson: (lessonId: number, attemptId: number) =>
    request<CompleteResult>(`/lessons/${lessonId}/complete`, { method: "POST", body: { attempt_id: attemptId } }),

  startPractice: () => request<Attempt>("/hearts/practice", { method: "POST" }),
  refillHearts: () => request<{ learner: Learner }>("/hearts/refill", { method: "POST" }),

  leaderboard: () => request<Leaderboard>("/leaderboard"),

  legendary: () => request<LegendaryStatus>("/legendary"),
  startLegendary: () => request<Attempt>("/legendary/start", { method: "POST" }),
};

/** Types mirroring the FastAPI response models (backend/app/schemas). */

export type SkillStatus = "locked" | "available" | "in_progress" | "completed";
export type LessonStatus = "locked" | "available" | "completed";
export type UnitColor = "green" | "blue" | "purple" | "orange" | "pink";
export type AttemptKind = "lesson" | "practice" | "legendary";

export interface Learner {
  id: number;
  username: string;
  display_name: string;
  avatar_color: string;
  xp_total: number;
  hearts: number;
  max_hearts: number;
  next_heart_in_seconds: number | null;
  gems: number;
  refill_cost_gems: number;
  current_streak: number;
  longest_streak: number;
  streak_active_today: boolean;
  daily_goal_xp: number;
  daily_xp: number;
}

export interface Course {
  id: number;
  code: string;
  title: string;
  language_name: string;
}

export interface SkillNode {
  id: number;
  title: string;
  icon: string;
  position: number;
  status: SkillStatus;
  lessons_completed: number;
  lesson_count: number;
  next_lesson_id: number | null;
  is_current: boolean;
}

export interface Unit {
  id: number;
  position: number;
  title: string;
  description: string;
  color: UnitColor;
  skills: SkillNode[];
}

export interface Path {
  course: Course;
  units: Unit[];
}

export interface LessonSummary {
  id: number;
  position: number;
  title: string;
  status: LessonStatus;
  exercise_count: number;
}

export interface SkillDetail {
  id: number;
  title: string;
  icon: string;
  unit_id: number;
  unit_title: string;
  status: SkillStatus;
  lessons_completed: number;
  lessons: LessonSummary[];
}

// ---- exercises (public shape: no answer keys) ----------------------------------------------
export interface TileOption {
  id: string;
  text: string;
}

export interface MultipleChoicePayload {
  options: TileOption[];
}
export interface TranslatePayload {
  source_text: string;
  direction: "to_target" | "to_source";
  tokens: string[];
}
export interface MatchPairsPayload {
  left: TileOption[];
  right: TileOption[];
}
export interface FillBlankPayload {
  before: string;
  after: string;
  options: string[];
  hint: string;
}
export interface TypeAnswerPayload {
  source_text: string;
  direction: "to_target" | "to_source";
}

interface ExerciseBase {
  id: number;
  position: number;
  prompt: string;
}

export type Exercise =
  | (ExerciseBase & { type: "multiple_choice"; payload: MultipleChoicePayload })
  | (ExerciseBase & { type: "translate"; payload: TranslatePayload })
  | (ExerciseBase & { type: "match_pairs"; payload: MatchPairsPayload })
  | (ExerciseBase & { type: "fill_blank"; payload: FillBlankPayload })
  | (ExerciseBase & { type: "type_answer"; payload: TypeAnswerPayload });

export type ExerciseType = Exercise["type"];

/** What the learner submits; exactly one field is used, depending on the exercise type. */
export interface AnswerPayload {
  option_id?: string;
  tokens?: string[];
  pairs?: { left_id: string; right_id: string }[];
  text?: string;
}

export interface Attempt {
  attempt_id: number;
  lesson_id: number;
  lesson_title: string;
  kind: AttemptKind;
  exercises: Exercise[];
  solved_exercise_ids: number[];
  learner: Learner;
  /** legendary attempts only */
  time_limit_seconds?: number | null;
  seconds_left?: number | null;
}

export interface LegendaryStatus {
  available: boolean;
  remaining: number;
  conquered: number;
  time_limit_seconds: number;
  reward_xp: number;
  reward_gems: number;
  wrong_answer_penalty_seconds: number;
}

export interface LegendaryEnd {
  attempt_id: number;
  status: string;
}

export interface AnswerResult {
  correct: boolean;
  already_solved: boolean;
  xp_awarded: number;
  heart_lost: boolean;
  out_of_hearts: boolean;
  correct_answer: string | null;
  explanation: string | null;
  learner: Learner;
  /** legendary attempts only: the server's authoritative time left after this answer */
  seconds_left?: number | null;
}

/** One completed pair in match-pairs. A wrong pair costs a heart (decided by the server). */
export interface PairCheckResult {
  match: boolean;
  heart_lost: boolean;
  out_of_hearts: boolean;
  learner: Learner;
  seconds_left?: number | null;
}

export interface Achievement {
  code: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlocked_at: string | null;
}

export interface CompleteResult {
  kind: AttemptKind;
  already_completed: boolean;
  xp_from_answers: number;
  xp_completion_bonus: number;
  xp_total_gained: number;
  gems_awarded: number;
  hearts_gained: number;
  mistakes: number;
  skill_id: number;
  skill_completed: boolean;
  new_achievements: Achievement[];
  learner: Learner;
}

export interface Profile {
  learner: Learner;
  joined_at: string;
  lessons_completed: number;
  skills_completed: number;
  total_skills: number;
  total_lessons: number;
  course_title: string;
  week: { date: string; xp: number }[];
  achievements: Achievement[];
}

export interface LeaderboardRow {
  rank: number;
  user_id: number;
  display_name: string;
  avatar_color: string;
  xp: number;
  is_current_user: boolean;
}

export interface Leaderboard {
  period_start: string;
  period_end: string;
  rows: LeaderboardRow[];
  current_user: LeaderboardRow;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

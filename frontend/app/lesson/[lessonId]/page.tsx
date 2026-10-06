import { LessonScreen } from "@/components/lesson/LessonScreen";
import { ErrorState } from "@/components/ui/StateBox";

interface Props {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<{ mode?: string }>;
}

export default async function LessonPage({ params, searchParams }: Props) {
  const [{ lessonId }, { mode }] = await Promise.all([params, searchParams]);
  const id = Number(lessonId);
  if (!Number.isInteger(id) || id <= 0) return <ErrorState message="That lesson doesn't exist." />;
  // `key` forces a fresh session if the learner jumps between lessons without a full reload
  return <LessonScreen key={`${id}-${mode}`} lessonId={id} kind={mode === "practice" ? "practice" : "lesson"} />;
}

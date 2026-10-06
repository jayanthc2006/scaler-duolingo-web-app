import { LessonScreen } from "@/components/lesson/LessonScreen";

interface Props {
  searchParams: Promise<{ run?: string }>;
}

/** A timed legendary run. The server picks the lesson, so no id is needed; `run` only forces a fresh session on retry. */
export default async function LegendaryPlayPage({ searchParams }: Props) {
  const { run } = await searchParams;
  return <LessonScreen key={`legendary-${run ?? "0"}`} lessonId={0} kind="legendary" />;
}

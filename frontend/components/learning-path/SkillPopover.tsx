"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { api } from "@/lib/api/endpoints";
import { useAsync } from "@/lib/hooks/useAsync";
import type { SkillNode } from "@/lib/types/api";

interface Props {
  skill: SkillNode;
  top: number;
  arrowX: number;
  onClose: () => void;
}

export function SkillPopover({ skill, top, arrowX, onClose }: Props) {
  const locked = skill.status === "locked";
  const ref = useRef<HTMLDivElement>(null);
  const detail = useAsync(() => (locked ? Promise.resolve(null) : api.skill(skill.id)));

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("a, button")?.focus({ preventScroll: true });
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={`skill-pop${locked ? " is-locked" : ""}`}
      style={{ top, ["--arrow-x" as string]: `${arrowX}px` }}
      role="dialog"
      aria-label={`${skill.title} details`}
    >
      <h3>{skill.title}</h3>
      {locked ? (
        <>
          <p>Finish the previous skill to unlock this one.</p>
          <button type="button" className="btn" disabled>
            <Icon name="lock" size={18} /> Locked
          </button>
        </>
      ) : (
        <>
          <p>
            {skill.status === "completed"
              ? "Skill complete! Practice any time to keep it fresh."
              : `Lesson ${skill.lessons_completed + 1} of ${skill.lesson_count}`}
          </p>
          {detail.error && <p className="pop-error" role="alert">{detail.error}</p>}
          <ul className="pop-lessons">
            {(detail.data?.lessons ?? []).map((lesson) => (
              <li key={lesson.id} className={`pop-lesson is-${lesson.status}`}>
                <span className="pop-lesson-dot" aria-hidden>
                  <Icon name={lesson.status === "completed" ? "check" : lesson.status === "locked" ? "lock" : "star"} size={13} />
                </span>
                <span className="pop-lesson-name">{lesson.title}</span>
              </li>
            ))}
          </ul>
          <div className="pop-actions">
            {skill.next_lesson_id !== null && (
              <Link href={`/lesson/${skill.next_lesson_id}`} className="btn">
                {skill.status === "in_progress" ? "Continue" : "Start"}
              </Link>
            )}
            {detail.data?.lessons
              .filter((l) => l.status === "completed")
              .slice(-1)
              .map((l) => (
                <Link key={l.id} href={`/lesson/${l.id}?mode=practice`} className="btn btn-ghost btn-sm">
                  Practice
                </Link>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

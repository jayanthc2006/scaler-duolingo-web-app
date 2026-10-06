"use client";

import { ProgressRing } from "@/components/learning-path/ProgressRing";
import { Icon } from "@/components/ui/Icon";
import type { SkillNode as Skill } from "@/lib/types/api";

interface Props {
  skill: Skill;
  x: number;
  y: number;
  open: boolean;
  justChanged: boolean;
  onToggle: () => void;
}

const STATUS_TEXT: Record<Skill["status"], string> = {
  locked: "locked",
  available: "ready to start",
  in_progress: "in progress",
  completed: "completed",
};

export function SkillNode({ skill, x, y, open, justChanged, onToggle }: Props) {
  const { status } = skill;
  const locked = status === "locked";
  const done = status === "completed";
  const showRing = status === "in_progress";
  const icon = locked ? skill.icon : done ? "check" : skill.icon;

  return (
    <div className="path-node" style={{ left: x, top: y }}>
      <div className={`node-wrap${skill.is_current ? " has-bubble" : ""}`}>
        {skill.is_current && <span className="start-bubble" aria-hidden>{status === "in_progress" ? "CONTINUE" : "START"}</span>}
        {showRing && <ProgressRing value={skill.lessons_completed / skill.lesson_count} />}
        {done && <ProgressRing value={1} />}
        <button
          type="button"
          className={`node-btn is-${status.replace("_", "-")}${locked ? " is-locked" : ""}${done ? " is-completed" : ""}${skill.is_current ? " is-current" : ""}${justChanged ? " is-just-unlocked" : ""}`}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`${skill.title}, ${STATUS_TEXT[status]}, ${skill.lessons_completed} of ${skill.lesson_count} lessons done`}
          onClick={onToggle}
        >
          <Icon name={icon} size={locked ? 30 : 34} />
          {done && (
            <span className="node-badge" aria-hidden>
              <Icon name="crown" size={16} />
            </span>
          )}
          {locked && (
            <span className="node-badge is-lock" aria-hidden>
              <Icon name="lock" size={14} />
            </span>
          )}
        </button>
      </div>
      <span className={`node-label${locked ? " is-locked" : ""}`}>
        {skill.title}
        <span className="node-sub">
          {skill.lessons_completed}/{skill.lesson_count}
        </span>
      </span>
    </div>
  );
}

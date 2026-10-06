"use client";

import { SkillNode } from "@/components/learning-path/SkillNode";
import { SkillPopover } from "@/components/learning-path/SkillPopover";
import { TRACK_WIDTH, connectorPath, layoutNodes, trackHeight } from "@/lib/utils/pathLayout";
import type { Unit } from "@/lib/types/api";

interface Props {
  unit: Unit;
  openSkillId: number | null;
  changedSkillIds: ReadonlySet<number>;
  onToggle: (skillId: number) => void;
}

const POPOVER_OFFSET = 150;

export function UnitSection({ unit, openSkillId, changedSkillIds, onToggle }: Props) {
  const points = layoutNodes(unit.skills.length);
  const done = unit.skills.filter((s) => s.status === "completed").length;
  const openIndex = unit.skills.findIndex((s) => s.id === openSkillId);

  return (
    <section className="path-unit" data-theme={unit.color} aria-labelledby={`unit-${unit.id}`}>
      <div className="unit-banner">
        <div>
          <h2 id={`unit-${unit.id}`}>{unit.title}</h2>
          <p>{unit.description}</p>
        </div>
        <span className="unit-count" aria-label={`${done} of ${unit.skills.length} skills complete`}>
          {done}/{unit.skills.length}
        </span>
      </div>

      <div className="path-track" style={{ height: trackHeight(unit.skills.length) }}>
        <svg className="path-svg" viewBox={`0 0 ${TRACK_WIDTH} ${trackHeight(unit.skills.length)}`} preserveAspectRatio="xMidYMin meet" aria-hidden>
          {points.slice(0, -1).map((p, i) => {
            const reached = unit.skills[i].status === "completed";
            return <path key={i} d={connectorPath(p, points[i + 1])} className={`path-seg ${reached ? "is-done" : "is-todo"}`} />;
          })}
        </svg>

        {unit.skills.map((skill, i) => (
          <SkillNode
            key={skill.id}
            skill={skill}
            x={points[i].x}
            y={points[i].y}
            open={skill.id === openSkillId}
            justChanged={changedSkillIds.has(skill.id)}
            onToggle={() => onToggle(skill.id)}
          />
        ))}

        {openIndex >= 0 && (
          <SkillPopover
            key={unit.skills[openIndex].id}
            skill={unit.skills[openIndex]}
            top={points[openIndex].y + POPOVER_OFFSET}
            arrowX={Math.max(24, Math.min(268, points[openIndex].x - (TRACK_WIDTH - 292) / 2))}
            onClose={() => onToggle(unit.skills[openIndex].id)}
          />
        )}
      </div>
    </section>
  );
}

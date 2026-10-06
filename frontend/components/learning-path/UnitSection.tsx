"use client";

import { SkillNode } from "@/components/learning-path/SkillNode";
import { SkillPopover } from "@/components/learning-path/SkillPopover";
import { Mascot } from "@/components/ui/Mascot";
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
  // Seed titles look like "Unit 1: First Steps": show "UNIT 1" as an eyebrow above the name.
  const [eyebrow, name] = unit.title.includes(":") ? unit.title.split(/:\s*/, 2) : ["", unit.title];
  const currentIndex = unit.skills.findIndex((s) => s.is_current);
  const openIndex = unit.skills.findIndex((s) => s.id === openSkillId);

  return (
    <section className="path-unit" data-theme={unit.color} aria-labelledby={`unit-${unit.id}`}>
      <div className="unit-banner">
        <div className="unit-text">
          {eyebrow && <span className="unit-eyebrow">{eyebrow}</span>}
          <h2 id={`unit-${unit.id}`}>{name}</h2>
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

        {currentIndex >= 0 && (
          <div
            className={`path-mascot ${points[currentIndex].x > TRACK_WIDTH / 2 ? "is-left" : "is-right"}`}
            style={{ top: points[currentIndex].y - 6 }}
            aria-hidden
          >
            <Mascot mood="wave" size={96} />
          </div>
        )}

        {unit.skills.map((skill, i) => (
          <SkillNode
            key={skill.id}
            skill={skill}
            x={points[i].x}
            y={points[i].y}
            open={skill.id === openSkillId}
            justChanged={changedSkillIds.has(skill.id)}
            bubbleDx={i > 0 ? points[i].x - points[i - 1].x : undefined}
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

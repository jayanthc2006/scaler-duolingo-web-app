import { describe, expect, it } from "vitest";
import { NODE_STEP, TRACK_WIDTH, connectorPath, layoutNodes, trackHeight } from "./pathLayout";

describe("pathLayout", () => {
  it("zig-zags around the track centre and never leaves the track", () => {
    const nodes = layoutNodes(9);
    expect(nodes[0].x).toBe(TRACK_WIDTH / 2);
    for (const n of nodes) {
      expect(n.x - 56).toBeGreaterThanOrEqual(0);
      expect(n.x + 56).toBeLessThanOrEqual(TRACK_WIDTH);
    }
    expect(nodes[1].y - nodes[0].y).toBe(NODE_STEP);
  });

  it("builds a cubic connector between node centres", () => {
    const [a, b] = layoutNodes(2);
    expect(connectorPath(a, b)).toMatch(/^M [\d.-]+ [\d.-]+ C /);
  });

  it("leaves room below the last node for the popover", () => {
    expect(trackHeight(3)).toBeGreaterThan(layoutNodes(3)[2].y + 120);
  });
});

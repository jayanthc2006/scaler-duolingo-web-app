/** Geometry for the zig-zag learning path. Pure so it can be unit tested. */
export const TRACK_WIDTH = 320;
export const NODE_STEP = 150;
export const NODE_TOP_PAD = 40;
const OFFSETS = [0, 52, 84, 52, 0, -52, -84, -52];
const NODE_CENTER_Y = 44; // radius of the node wrap

export interface Point {
  x: number;
  y: number;
}

/** Top-left anchor (x = horizontal centre) of each node in a track. */
export function layoutNodes(count: number): Point[] {
  return Array.from({ length: count }, (_, i) => ({
    x: TRACK_WIDTH / 2 + OFFSETS[i % OFFSETS.length],
    y: NODE_TOP_PAD + i * NODE_STEP,
  }));
}

export function trackHeight(count: number): number {
  return NODE_TOP_PAD + Math.max(0, count - 1) * NODE_STEP + 170;
}

/** Smooth S-curve between the visual centres of two consecutive nodes. */
export function connectorPath(a: Point, b: Point): string {
  const ay = a.y + NODE_CENTER_Y;
  const by = b.y + NODE_CENTER_Y;
  const mid = (ay + by) / 2;
  return `M ${a.x} ${ay} C ${a.x} ${mid}, ${b.x} ${mid}, ${b.x} ${by}`;
}

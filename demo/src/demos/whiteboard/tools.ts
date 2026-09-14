import type { Directory, Opened } from "@ninepatch/core";
import type { LocalPointer, Shape, SurfaceDoc } from "../../types";
import { within } from "./geometry";

export const line = "./demos/whiteboard/line.tsx";

// the same shape: what it is and where it sits — a record's identity on
// its surface, which survives the document changing under it
export function same(a: Shape | null | undefined, b: Shape): boolean {
  return !!a && a.componentUrl === b.componentUrl && a.x === b.x && a.y === b.y;
}

// a surface, opened: its record, and on it the pointer in its units and
// how many screen pixels a unit is
export type Target = {
  doc: Opened<SurfaceDoc>;
  pointer: Opened<LocalPointer>;
  scale: Opened<number>;
  close(): void;
};

// The deepest surface under the pointer, starting from the one at `path`
// with `p` in its units: a shape that is a surface publishes `pointer` on
// its record, so a surface is found by listing, and its pointer already
// translated — down a level, and again, until no shape under the pointer
// is a surface.
export async function surfaceUnder(
  dir: Directory,
  path: string[],
  p: { x: number; y: number }
): Promise<Target> {
  const doc = await dir.open<SurfaceDoc>(path);
  for (const [id, s] of Object.entries(doc.value.shapes)) {
    if (!within(s.outline, p.x - s.x, p.y - s.y)) continue;
    const below = [...path, "shapes", id];
    if (!dir.list(below).value.includes("pointer")) continue;
    const pointer = await dir.open<LocalPointer>([...below, "pointer"]);
    const q = pointer.value;
    pointer.close();
    if (!q) continue;
    doc.close();
    return surfaceUnder(dir, below, q);
  }
  const pointer = await dir.open<LocalPointer>([...path, "pointer"]);
  const scale = await dir.open<number>([...path, "scale"]);
  return {
    doc,
    pointer,
    scale,
    close() {
      doc.close();
      pointer.close();
      scale.close();
    },
  };
}

export function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// "./demos/whiteboard/line.tsx" → "Line"
export function componentName(url: string): string {
  const base = url
    .split("/")
    .pop()!
    .replace(/\.tsx?$/, "");
  return base[0].toUpperCase() + base.slice(1);
}

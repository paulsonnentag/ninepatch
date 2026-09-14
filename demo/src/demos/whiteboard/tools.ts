import type { Directory, Opened } from "@ninepatch/core";
import type { LocalPointer, SurfaceDoc } from "../../types";
import { within } from "./geometry";

export const line = "./demos/whiteboard/line.tsx";

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

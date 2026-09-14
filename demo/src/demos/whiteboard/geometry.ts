// an outline is a flat point list relative to a shape's x/y

export function bounds(outline: number[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < outline.length; i += 2) {
    minX = Math.min(minX, outline[i]);
    maxX = Math.max(maxX, outline[i]);
    minY = Math.min(minY, outline[i + 1]);
    maxY = Math.max(maxY, outline[i + 1]);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Inside the outline's bounding box. */
export function within(outline: number[], x: number, y: number): boolean {
  const b = bounds(outline);
  return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
}

/** Within `distance` of the outline read as an open polyline. */
export function near(
  outline: number[],
  x: number,
  y: number,
  distance: number
): boolean {
  if (outline.length === 2)
    return Math.hypot(outline[0] - x, outline[1] - y) <= distance;
  for (let i = 0; i + 3 < outline.length; i += 2) {
    const ax = outline[i],
      ay = outline[i + 1],
      bx = outline[i + 2],
      by = outline[i + 3];
    const len = (bx - ax) ** 2 + (by - ay) ** 2;
    const t =
      len === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / len)
          );
    if (Math.hypot(ax + t * (bx - ax) - x, ay + t * (by - ay) - y) <= distance)
      return true;
  }
  return false;
}

export function points(outline: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < outline.length; i += 2)
    out.push(`${outline[i]},${outline[i + 1]}`);
  return out.join(" ");
}

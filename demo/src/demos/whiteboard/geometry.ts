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

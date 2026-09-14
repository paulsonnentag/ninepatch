import type { Directory } from "@ninepatch/core";
import type { LocalPointer, SurfaceDoc } from "../../types";
import { surface } from "./surface";

// A flat surface: shapes sit in `dom` at their x/y, in its own pixels, so
// the pointer it got is already in its units and a unit is a pixel. Given
// `document`, `dom` and `pointer` it runs anywhere: under the root, where
// a recorder writes the pointer, or as a shape on another surface.
export default async function Canvas(dir: Directory) {
  const doc = await dir.open<SurfaceDoc>("document");
  const dom = await dir.open<HTMLElement>("dom");
  const pointer = await dir.open<LocalPointer>("pointer");
  await surface(dir, doc, dom.value, { pointer, scale: 1 });
}

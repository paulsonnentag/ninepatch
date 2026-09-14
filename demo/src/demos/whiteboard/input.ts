import type { Directory } from "@ninepatch/core";
import type { LocalPointer } from "../../types";

// The only place that listens to pointer events: writes the position as
// `ui/pointer`, relative to `ui/dom` — the root surface's units.
export default async function InputRecorder(dir: Directory) {
  const dom = await dir.open<HTMLElement>("ui/dom");
  dir.mount("ui/pointer", null as LocalPointer);
  const pointer = await dir.open<LocalPointer>("ui/pointer");
  const el = dom.value;

  const move = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    pointer.set({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const leave = () => pointer.set(null);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerleave", leave);

  dir.signal.addEventListener("abort", () => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerleave", leave);
  });
}

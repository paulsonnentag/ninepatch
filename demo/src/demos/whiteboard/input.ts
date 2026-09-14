import type { Directory } from "@ninepatch/core";
import type { LocalPointer } from "../../types";

// The only place that listens to pointer events: writes position and
// button into `pointer`, relative to `dom` — the units of whoever runs it.
export default async function InputRecorder(dir: Directory) {
  const el = (await dir.open<HTMLElement>("dom")).value;
  dir.mount("pointer", null as LocalPointer); // taken back when this recorder goes
  const pointer = await dir.open<LocalPointer>("pointer");

  let down = false;
  const at = (e: PointerEvent): LocalPointer => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, down };
  };
  const press = (e: PointerEvent) => {
    down = true;
    pointer.set(at(e));
  };
  const move = (e: PointerEvent) => pointer.set(at(e));
  const release = (e: PointerEvent) => {
    down = false;
    if (el.contains(e.target as Node)) pointer.set(at(e));
    else pointer.set(null);
  };
  const leave = () => {
    if (!down) pointer.set(null); // a drag may leave and come back
  };
  el.addEventListener("pointerdown", press); // a tool that stops this never presses the surface
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerleave", leave);
  addEventListener("pointerup", release);

  dir.signal.addEventListener("abort", () => {
    el.removeEventListener("pointerdown", press);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerleave", leave);
    removeEventListener("pointerup", release);
  });
}

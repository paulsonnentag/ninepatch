import { from } from "solid-js";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import type { LocalPointer, Selected, Stroke } from "../../types";
import { bounds } from "./geometry";
import { line, round, same, surfaceUnder, type Target } from "./tools";

// A pen is a shape that draws. Clicking it puts its record in `selected`
// — one name at the top, so the other pens let go and the map holds
// still. While selected and the pointer is down, it finds the surface
// under the pointer — the `surface` it sits on, or a surface on that,
// however deep — and writes a line into that surface's document, in that
// surface's units: the width divided by the surface's scale, so the line
// is the pen's width on screen as it is drawn, however far in the map is
// zoomed.
export default async function Pen(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<Stroke>("document");
  const selected = await dir.open<Selected>("selected");
  const pointer = await dir.open<LocalPointer>("surface/pointer");
  const active = () => same(selected.value, doc.value);

  let stroke: (Target & { id: string; x: number; y: number }) | undefined;
  let seeking = false;
  const lift = () => {
    stroke?.close();
    stroke = undefined;
  };
  const unsubscribe = pointer.subscribe(async (p) => {
    if (!active() || !p?.down) return lift();
    if (stroke) {
      const q = stroke.pointer.value;
      const { id, x, y } = stroke;
      if (q)
        stroke.doc.change((d) =>
          d.shapes[id]?.outline.push(round(q.x - x), round(q.y - y))
        );
      return;
    }
    if (seeking) return;
    seeking = true;
    const target = await surfaceUnder(dir, ["surface"], p);
    seeking = false;
    const q = target.pointer.value;
    if (dir.signal.aborted || !active() || !q?.down) return target.close();
    const { color, width } = doc.value;
    const fresh: Stroke = {
      componentUrl: line,
      x: q.x,
      y: q.y,
      outline: [0, 0],
      color,
      width: round(width / target.scale.value),
    };
    const id = crypto.randomUUID();
    target.doc.change((d) => (d.shapes[id] = fresh));
    stroke = { ...target, id, x: q.x, y: q.y };
  });

  const dispose = render(() => {
    const pen = from(doc, doc.value);
    const chosen = from(selected, selected.value);
    const box = () => bounds(pen()?.outline ?? []);
    return (
      <button
        class="pen"
        classList={{ active: same(chosen(), doc.value) }}
        style={{
          left: `${box().x}px`,
          top: `${box().y}px`,
          width: `${box().width}px`,
          height: `${box().height}px`,
          background: pen()?.color,
        }}
        title={`${pen()?.width}px`}
        on:pointerdown={(e) => e.stopPropagation()} // a press on a tool is not a press on the surface
        onClick={() => selected.set(active() ? null : doc.value)}
      >
        <span
          class="tip"
          style={{ width: `${pen()?.width}px`, height: `${pen()?.width}px` }}
        />
      </button>
    );
  }, dom.value);

  dir.signal.addEventListener("abort", () => {
    dispose();
    unsubscribe();
    lift();
  });
}

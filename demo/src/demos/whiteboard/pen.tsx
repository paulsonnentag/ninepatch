import { from } from "solid-js";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import type { LocalPointer, Stroke, Tool } from "../../types";
import { bounds } from "./geometry";
import { line, round, surfaceUnder, type Target } from "./tools";

// A pen is a shape that draws. Clicking it makes it the `tool` — one name
// at the top, so the other pens let go and the map holds still. While it
// is the tool and the pointer is down, it finds the surface under the
// pointer — its `parent`, or a surface on it, however deep — and writes a
// line into that surface's document, in that surface's units: the width
// divided by the surface's scale, so the line is the pen's width on
// screen as it is drawn, however far in the map is zoomed.
export default async function Pen(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<Stroke>("document");
  const id = (await dir.open<string>("id")).value;
  const tool = await dir.open<Tool>("tool");
  const pointer = await dir.open<LocalPointer>("parent/pointer");
  const active = () => tool.value === id;

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
    const target = await surfaceUnder(dir, ["parent"], p);
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
    const sid = crypto.randomUUID();
    target.doc.change((d) => (d.shapes[sid] = fresh));
    stroke = { ...target, id: sid, x: q.x, y: q.y };
  });

  const dispose = render(() => {
    const pen = from(doc, doc.value);
    const selected = from(tool, tool.value);
    const box = () => bounds(pen()?.outline ?? []);
    return (
      <button
        class="pen"
        classList={{ active: selected() === id }}
        style={{
          left: `${box().x}px`,
          top: `${box().y}px`,
          width: `${box().width}px`,
          height: `${box().height}px`,
          background: pen()?.color,
        }}
        title={`${pen()?.width}px`}
        on:pointerdown={(e) => e.stopPropagation()} // a press on a tool is not a press on the surface
        onClick={() => tool.set(active() ? null : id)}
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

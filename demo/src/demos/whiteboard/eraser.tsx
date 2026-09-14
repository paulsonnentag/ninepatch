import { from } from "solid-js";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import type { EraserShape, LocalPointer, Tool } from "../../types";
import { bounds, near } from "./geometry";
import { line, surfaceUnder, type Target } from "./tools";

// The other kind of pen: as the `tool`, it finds the surface under the
// pointer the same way and removes the lines the pointer passes over
// instead of adding one.
export default async function Eraser(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<EraserShape>("document");
  const id = (await dir.open<string>("id")).value;
  const tool = await dir.open<Tool>("tool");
  const pointer = await dir.open<LocalPointer>("parent/pointer");
  const active = () => tool.value === id;

  let target: Target | undefined;
  let seeking = false;
  const lift = () => {
    target?.close();
    target = undefined;
  };
  const unsubscribe = pointer.subscribe(async (p) => {
    if (!active() || !p?.down) return lift();
    if (!target) {
      if (seeking) return;
      seeking = true;
      const found = await surfaceUnder(dir, ["parent"], p);
      seeking = false;
      if (dir.signal.aborted || !active() || !found.pointer.value?.down)
        return found.close();
      target = found;
    }
    const q = target.pointer.value;
    if (!q) return;
    const reach = doc.value.width / target.scale.value; // the eraser's size on screen, in the surface's units
    const hits = Object.entries(target.doc.value.shapes)
      .filter(
        ([, s]) =>
          s.componentUrl === line &&
          near(s.outline, q.x - s.x, q.y - s.y, reach)
      )
      .map(([sid]) => sid);
    if (hits.length)
      target.doc.change((d) => {
        for (const sid of hits) delete d.shapes[sid];
      });
  });

  const dispose = render(() => {
    const eraser = from(doc, doc.value);
    const selected = from(tool, tool.value);
    const box = () => bounds(eraser()?.outline ?? []);
    return (
      <button
        class="pen eraser"
        classList={{ active: selected() === id }}
        style={{
          left: `${box().x}px`,
          top: `${box().y}px`,
          width: `${box().width}px`,
          height: `${box().height}px`,
        }}
        title="eraser"
        on:pointerdown={(e) => e.stopPropagation()}
        onClick={() => tool.set(active() ? null : id)}
      />
    );
  }, dom.value);

  dir.signal.addEventListener("abort", () => {
    dispose();
    unsubscribe();
    lift();
  });
}

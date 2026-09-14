import { from } from "solid-js";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import type { EraserShape, LocalPointer, Selected } from "../../types";
import { bounds, near } from "./geometry";
import { line, same, surfaceUnder, type Target } from "./tools";

// The other kind of pen: when selected, it finds the surface under the
// pointer the same way and removes the lines the pointer passes over
// instead of adding one.
export default async function Eraser(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<EraserShape>("document");
  const selected = await dir.open<Selected>("selected");
  const pointer = await dir.open<LocalPointer>("surface/pointer");
  const active = () => same(selected.value, doc.value);

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
      const found = await surfaceUnder(dir, ["surface"], p);
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
      .map(([id]) => id);
    if (hits.length)
      target.doc.change((d) => {
        for (const id of hits) delete d.shapes[id];
      });
  });

  const dispose = render(() => {
    const eraser = from(doc, doc.value);
    const chosen = from(selected, selected.value);
    const box = () => bounds(eraser()?.outline ?? []);
    return (
      <button
        class="pen eraser"
        classList={{ active: same(chosen(), doc.value) }}
        style={{
          left: `${box().x}px`,
          top: `${box().y}px`,
          width: `${box().width}px`,
          height: `${box().height}px`,
        }}
        title="eraser"
        on:pointerdown={(e) => e.stopPropagation()}
        onClick={() => selected.set(active() ? null : doc.value)}
      />
    );
  }, dom.value);

  dir.signal.addEventListener("abort", () => {
    dispose();
    unsubscribe();
    lift();
  });
}

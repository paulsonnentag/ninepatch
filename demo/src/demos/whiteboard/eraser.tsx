import { from } from "solid-js";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import type { EraserShape, Tool } from "../../types";
import { bounds } from "./geometry";

// The other kind of pen: as the `tool`, a surface removes the lines the
// pointer passes over instead of adding one.
export default async function Eraser(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<EraserShape>("document");
  const id = (await dir.open<string>("id")).value;
  const tool = await dir.open<Tool>("tool");

  const dispose = render(() => {
    const eraser = from(doc, doc.value);
    const selected = from(tool, tool.value);
    const active = () => selected()?.id === id;
    const box = () => bounds(eraser()?.outline ?? []);
    return (
      <button
        class="pen eraser"
        classList={{ active: active() }}
        style={{
          left: `${box().x}px`,
          top: `${box().y}px`,
          width: `${box().width}px`,
          height: `${box().height}px`,
        }}
        title="eraser"
        on:pointerdown={(e) => e.stopPropagation()}
        onClick={() =>
          tool.set(
            active() ? null : { id, kind: "eraser", width: doc.value.width }
          )
        }
      />
    );
  }, dom.value);

  dir.signal.addEventListener("abort", dispose);
}

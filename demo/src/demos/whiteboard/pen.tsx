import { from } from "solid-js";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import type { Stroke, Tool } from "../../types";
import { bounds } from "./geometry";

// A pen is a shape: a button on the surface. Clicking it makes it the
// `tool` — one name at the top, so every surface, however deep, draws
// with it when the pointer is down on that surface.
export default async function Pen(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<Stroke>("document");
  const id = (await dir.open<string>("id")).value;
  const tool = await dir.open<Tool>("tool");

  const dispose = render(() => {
    const pen = from(doc, doc.value);
    const selected = from(tool, tool.value);
    const active = () => selected()?.id === id;
    const box = () => bounds(pen()?.outline ?? []);
    return (
      <button
        class="pen"
        classList={{ active: active() }}
        style={{
          left: `${box().x}px`,
          top: `${box().y}px`,
          width: `${box().width}px`,
          height: `${box().height}px`,
          background: pen()?.color,
        }}
        title={`${pen()?.width}px`}
        on:pointerdown={(e) => e.stopPropagation()} // a press on a tool is not a press on the surface
        onClick={() => {
          const { color, width } = doc.value;
          tool.set(active() ? null : { id, kind: "pen", color, width });
        }}
      >
        <span
          class="tip"
          style={{ width: `${pen()?.width}px`, height: `${pen()?.width}px` }}
        />
      </button>
    );
  }, dom.value);

  dir.signal.addEventListener("abort", dispose);
}

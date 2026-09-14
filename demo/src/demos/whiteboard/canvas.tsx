import { For, from, onCleanup } from "solid-js";
import { render } from "solid-js/web";
import type { Directory, Opened } from "@ninepatch/core";
import type { LocalPointer, Shape, SurfaceDoc } from "../../types";
import { componentName } from "./tools";

// A flat surface. Its document is the surface: the shapes in it, and
// mounted onto it the `pointer` in its units and the `scale` of a unit
// on screen — a pixel each, here. Every shape is placed as a component of
// its own: a fork with the wrapper as `dom`, this document as `surface`,
// and the shape's record as `document`. Given `document`, `dom` and
// `pointer` it runs anywhere: under the root, where a recorder writes the
// pointer, or as a shape on another surface.
export default async function Canvas(dir: Directory) {
  const doc = await dir.open<SurfaceDoc>("document");
  const dom = await dir.open<HTMLElement>("dom");
  const pointer = await dir.open<LocalPointer>("pointer");
  doc.mount("pointer", pointer);
  doc.mount("scale", 1);

  const dispose = render(() => {
    const state = from(doc, doc.value);
    return (
      <For each={Object.keys(state().shapes)}>
        {(id) => {
          const shape = () => state().shapes[id] as Shape | undefined;
          const el = (
            <div
              class="shape"
              style={{
                transform: `translate(${shape()?.x ?? 0}px, ${shape()?.y ?? 0}px)`,
              }}
            />
          ) as HTMLDivElement;

          const child = dir.fork(id);
          child.mount("dom", el);
          child.mount("surface", doc);
          let own: Opened<Shape> | undefined;
          (async () => {
            own = await dir.open<Shape>(["document", "shapes", id]);
            child.mount("document", own);
            const url = own.value.componentUrl;
            child
              .spawn(componentName(url), url)
              .terminated.catch((e: unknown) => {
                if (!child.signal.aborted) el.textContent = String(e);
              });
          })().catch((e: unknown) => {
            if (!child.signal.aborted) el.textContent = String(e);
          });
          onCleanup(() => {
            child.close();
            own?.close();
          });
          return el;
        }}
      </For>
    );
  }, dom.value);

  dir.signal.addEventListener("abort", dispose);
}

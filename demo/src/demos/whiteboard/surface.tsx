import { For, from, onCleanup } from "solid-js";
import { render } from "solid-js/web";
import { field, type Directory } from "@ninepatch/core";
import type { SurfaceDoc, SurfaceShape } from "../../types";

// A surface renders every shape in its document as a component and gives
// each one a namespace under `ui`: its element as `ui/dom`, and —
// inherited from wherever this surface runs — `ui/pointer` in this
// surface's units and `ui/surface`, the surface itself: its document,
// with the one below mounted into it as `parent`.
export default async function Surface(dir: Directory) {
  const dom = await dir.open<HTMLElement>("ui/dom");
  const doc = await dir.open<SurfaceDoc>("ui/surface");

  const dispose = render(() => {
    const state = from(doc, doc.value);
    return (
      <For each={Object.keys(state().shapes)}>
        {(id) => {
          const shape = () => state().shapes[id];
          const el = (
            <div
              class="shape"
              style={{
                transform: `translate(${shape()?.x ?? 0}px, ${shape()?.y ?? 0}px)`,
              }}
            />
          ) as HTMLDivElement;

          const w = dir.fork(id);
          w.mount("ui/dom", el);
          w.mount("shape", field(doc, ["shapes", id]));
          if ((shape() as SurfaceShape | undefined)?.docUrl)
            w.mount("document", field(doc, ["shapes", id, "docUrl"]));
          else w.unmount("document"); // a plain shape doesn't see this surface's doc
          const process = w.spawn(
            componentName(shape()!.componentUrl),
            shape()!.componentUrl
          );
          process.terminated.catch((e: unknown) => {
            if (!w.signal.aborted) el.textContent = String(e);
          });
          onCleanup(() => w.close());
          return el;
        }}
      </For>
    );
  }, dom.value);

  dir.signal.addEventListener("abort", dispose);
}

function componentName(url: string): string {
  const base = url
    .split("/")
    .pop()!
    .replace(/\.tsx?$/, "");
  return base[0].toUpperCase() + base.slice(1);
}

import { For, from, onCleanup } from "solid-js";
import { render } from "solid-js/web";
import type { Directory, Handle, Opened } from "@ninepatch/core";
import type { LocalPointer, Shape, SurfaceDoc } from "../../types";

// What makes a component a surface. Given its record and the pointer in
// its units and its screen scale, it mounts those two onto the record and
// binds the record as `surface` — a purely logical thing: what is on it,
// where the pointer is, how big a unit is. Then it places every shape in
// the record as a component of its own, in `layer`: a fork with the
// wrapper as `dom`, the record as `document`, opened through `surface` so
// whatever the shape mounts onto it lands on the surface at
// `shapes/<id>/…`, and the surface itself as `parent`. It draws nothing;
// the pens do.
export async function surface(
  dir: Directory,
  doc: Opened<SurfaceDoc>,
  layer: HTMLElement,
  self: { pointer: Handle<LocalPointer>; scale: Handle<number> | number }
): Promise<void> {
  doc.mount("pointer", self.pointer);
  doc.mount("scale", self.scale);
  dir.mount("surface", doc);

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
          child.mount("id", id);
          child.mount("parent", doc);
          let own: Opened<Shape> | undefined;
          (async () => {
            // through the bind: what the shape mounts onto its document
            // lands on the surface, where everyone reading it can see
            own = await dir.open<Shape>(["surface", "shapes", id]);
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
  }, layer);

  dir.signal.addEventListener("abort", dispose);
}

function componentName(url: string): string {
  const base = url
    .split("/")
    .pop()!
    .replace(/\.tsx?$/, "");
  return base[0].toUpperCase() + base.slice(1);
}

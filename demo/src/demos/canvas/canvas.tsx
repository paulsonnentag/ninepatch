import { For, from, onCleanup } from "solid-js";
import { render } from "solid-js/web";
import { field, type Directory } from "@ninepatch/core";
import type { CanvasDoc } from "../../types";

export default async function Canvas(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<CanvasDoc>("document");
  const selection = await dir.open<string | null>("selection");

  const dispose = render(() => {
    const state = from(doc, doc.value);
    const selected = from(selection, selection.value);

    const drag = (down: PointerEvent, id: string) => {
      const target = down.target as HTMLElement;
      if (["INPUT", "BUTTON", "CANVAS", "A"].includes(target.tagName)) return;
      selection.set(id);
      const start = state().items[id];
      if (!start) return;
      const dx = down.clientX - start.x;
      const dy = down.clientY - start.y;
      const move = (e: PointerEvent) =>
        doc.change((d) => {
          const it = d.items[id];
          if (it) {
            it.x = Math.max(0, e.clientX - dx);
            it.y = Math.max(0, e.clientY - dy);
          }
        });
      const up = () => {
        removeEventListener("pointermove", move);
        removeEventListener("pointerup", up);
      };
      addEventListener("pointermove", move);
      addEventListener("pointerup", up);
    };

    return (
      <div
        class="board"
        tabIndex={0} // focusable, so backspace can reach it
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) selection.set(null); // beside the items: clear
        }}
        onKeyDown={(e) => {
          if (e.key !== "Backspace" || e.target !== e.currentTarget) return;
          const id = selected();
          if (!id) return;
          doc.change((d) => delete d.items[id]);
          selection.set(null);
        }}
      >
        <For each={Object.keys(state().items)}>
          {(id) => {
            const item = () => state().items[id];
            const el = (
              <div
                class="item"
                classList={{ selected: selected() === id }}
                style={{
                  left: `${item()?.x ?? 0}px`,
                  top: `${item()?.y ?? 0}px`,
                }}
                onPointerDown={(e) => drag(e, id)}
              />
            ) as HTMLDivElement;

            // the wrapper is the child's whole world: its dom, and its
            // document as a link that re-follows if the docUrl is rewritten
            const child = dir.fork(id);
            child.mount("dom", el);
            if (item()?.docUrl)
              child.mount("document", field(doc, ["items", id, "docUrl"]));
            else child.unmount("document"); // don't let the canvas's own document leak in
            const process = child.spawn(
              componentName(item()!.componentUrl),
              item()!.componentUrl
            );
            process.terminated.catch((e: unknown) => {
              if (!child.signal.aborted) el.textContent = String(e);
            });
            onCleanup(() => child.close());
            return el;
          }}
        </For>
      </div>
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

import { For, from, onCleanup } from "solid-js";
import { render } from "solid-js/web";
import { field, type Directory } from "@ninepatch/core";
import type { CanvasDoc } from "../../types";

export default async function Canvas(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<CanvasDoc>("document");
  const selection = await dir.open<string[]>("selection"); // the selected items' document URLs

  const dispose = render(() => {
    const state = from(doc, doc.value);
    const selected = from(selection, selection.value);
    const urlOf = (id: string) => state().items[id]?.docUrl;
    const isSelected = (id: string) => {
      const url = urlOf(id);
      return !!url && selected().includes(url);
    };

    const select = (id: string, shift: boolean) => {
      const url = urlOf(id);
      if (!url) return;
      const current = selection.value;
      if (shift)
        selection.set(
          current.includes(url)
            ? current.filter((u) => u !== url)
            : [...current, url]
        );
      else if (!current.includes(url)) selection.set([url]);
    };

    const drag = (down: PointerEvent, id: string) => {
      const target = down.target as HTMLElement;
      if (["INPUT", "BUTTON", "CANVAS", "A"].includes(target.tagName)) return;
      select(id, down.shiftKey);
      if (down.shiftKey) return; // shift only toggles
      // the whole selection moves together
      const starts = new Map<string, { x: number; y: number }>();
      for (const [key, item] of Object.entries(state().items))
        if (
          key === id ||
          (item.docUrl && selection.value.includes(item.docUrl))
        )
          starts.set(key, { x: item.x, y: item.y });
      const move = (e: PointerEvent) =>
        doc.change((d) => {
          for (const [key, start] of starts) {
            const it = d.items[key];
            if (!it) continue;
            it.x = Math.max(0, start.x + e.clientX - down.clientX);
            it.y = Math.max(0, start.y + e.clientY - down.clientY);
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
          if (e.target === e.currentTarget) selection.set([]); // beside the items: clear
        }}
        onKeyDown={(e) => {
          if (e.key !== "Backspace" || e.target !== e.currentTarget) return;
          const urls = selected();
          if (urls.length === 0) return;
          doc.change((d) => {
            for (const [id, item] of Object.entries(d.items))
              if (item.docUrl && urls.includes(item.docUrl)) delete d.items[id];
          });
          selection.set([]);
        }}
      >
        <For each={Object.keys(state().items)}>
          {(id) => {
            const item = () => state().items[id];
            const el = (
              <div
                class="item"
                classList={{ selected: isSelected(id) }}
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

import { createEffect, For, on, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import type { Workspace } from "../../types";
import { watchTitle } from "./describe";
import { manage, slotOf } from "./windows";

type Placement = { x: number; y: number; z: number };

// every open document is a window placed freely; the selection is on top,
// and `window 2` as a target puts a document where the second one was
export default async function Spatial(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const ws = manage(dir, await dir.open<Workspace>("workspace"));

  const dispose = render(() => {
    // where each window sits, by document: the manager's own, lost on a swap
    const [placement, setPlacement] = createStore<Record<string, Placement>>(
      {}
    );
    let top = 0;

    const place = (document: string) => {
      if (placement[document]) return;
      const n = Object.keys(placement).length % 6;
      setPlacement(document, { x: 20 + n * 36, y: 16 + n * 28, z: ++top });
    };

    createEffect(
      on(ws.selected, (s, prev) => {
        const at = prev ? slotOf(s.target, "window") : undefined; // not a stale target from before this manager ran
        if (at !== undefined && s.document) {
          const replaced = ws.openIn(s, at);
          if (replaced && placement[replaced])
            setPlacement(s.document, { ...placement[replaced] }); // its spot, too
        } else ws.ensureOpen(s);
        if (!s.document) return;
        place(s.document);
        setPlacement(s.document, "z", ++top);
      })
    );
    createEffect(() =>
      ws.publish(
        Object.fromEntries(ws.open().map((d, i) => [`window ${i + 1}`, [d]]))
      )
    );

    const close = (document: string) =>
      ws.close(document, (rest) =>
        rest.reduce<string | undefined>(
          (best, d) => (!best || placement[d].z > placement[best].z ? d : best),
          undefined
        )
      );

    const drag = (down: PointerEvent, document: string) => {
      const start = placement[document];
      const dx = down.clientX - start.x;
      const dy = down.clientY - start.y;
      const move = (e: PointerEvent) =>
        setPlacement(document, {
          x: Math.max(0, e.clientX - dx),
          y: Math.max(0, e.clientY - dy),
        });
      const up = () => {
        removeEventListener("pointermove", move);
        removeEventListener("pointerup", up);
      };
      addEventListener("pointermove", move);
      addEventListener("pointerup", up);
    };

    return (
      <div class="spatial">
        <For each={ws.open()}>
          {(document) => {
            place(document); // opened before this manager ran: give it a spot
            const at = () => placement[document];
            const title = watchTitle(dir, document);
            const body = (<div class="wm-body" />) as HTMLDivElement;
            const child = ws.mount(document, body);
            onCleanup(() => child.close());
            return (
              <div
                class="wm-window"
                classList={{ focused: ws.selected().document === document }}
                style={{
                  left: `${at().x}px`,
                  top: `${at().y}px`,
                  "z-index": at().z,
                }}
                onPointerDown={() => {
                  if (ws.selected().document !== document) ws.select(document);
                }}
              >
                <div
                  class="wm-titlebar"
                  onPointerDown={(e) => drag(e, document)}
                >
                  <span class="wm-title">{title()}</span>
                  <button
                    class="wm-close"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => close(document)}
                  >
                    ×
                  </button>
                </div>
                {body}
              </div>
            );
          }}
        </For>
      </div>
    );
  }, dom.value);
  dir.signal.addEventListener("abort", dispose);
}

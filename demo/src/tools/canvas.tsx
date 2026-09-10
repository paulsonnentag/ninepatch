import { For, from, Show } from "solid-js";
import { render } from "solid-js/web";
import type { Handle, Directory } from "@ninepatch/core";
import type { CanvasDoc } from "../types";

export async function Canvas(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<CanvasDoc>("doc");
  const selection = await dir.open<string | null>("selection");
  const dispose = render(
    () => <Cards doc={doc} selection={selection} />,
    dom.value
  );
  dir.signal.addEventListener("abort", dispose);
}

function Cards(props: {
  doc: Handle<CanvasDoc>;
  selection: Handle<string | null>;
}) {
  const state = from(props.doc, props.doc.value);
  const selected = from(props.selection, props.selection.value);

  const change = (fn: (d: CanvasDoc) => void) => props.doc.change(fn);
  const add = () =>
    change((d) => {
      d.cards[Math.random().toString(36).slice(2, 8)] = {
        x: 16,
        y: 16,
        title: "somewhere new",
      };
    });

  return (
    <div class="canvas">
      <button class="add" onClick={add}>
        add card
      </button>
      <For each={Object.keys(state().cards)}>
        {(id) => {
          const card = () => state().cards[id];
          const number = (raw: string) => {
            const value = parseFloat(raw);
            return Number.isFinite(value) ? value : undefined;
          };
          const drag = (down: PointerEvent) => {
            const target = down.target as HTMLElement;
            if (target.tagName === "INPUT" || target.tagName === "BUTTON")
              return;
            props.selection.set(id);
            const start = card();
            if (!start) return;
            const dx = down.clientX - start.x;
            const dy = down.clientY - start.y;
            const move = (e: PointerEvent) =>
              change((d) => {
                const c = d.cards[id];
                if (c) {
                  c.x = Math.max(0, e.clientX - dx);
                  c.y = Math.max(0, e.clientY - dy);
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
              class="card"
              classList={{ selected: selected() === id }}
              style={{
                left: `${card()?.x ?? 0}px`,
                top: `${card()?.y ?? 0}px`,
              }}
              onPointerDown={drag}
            >
              <input
                class="title"
                value={card()?.title ?? ""}
                onInput={(e) =>
                  change(
                    (d) =>
                      void (
                        d.cards[id] &&
                        (d.cards[id].title = e.currentTarget.value)
                      )
                  )
                }
              />
              <Show when={selected() === id}>
                <div class="coords">
                  <input
                    placeholder="lat"
                    value={card()?.lat ?? ""}
                    onChange={(e) =>
                      change((d) => {
                        const v = number(e.currentTarget.value);
                        if (d.cards[id]) {
                          if (v === undefined) delete d.cards[id].lat;
                          else d.cards[id].lat = v;
                        }
                      })
                    }
                  />
                  <input
                    placeholder="lng"
                    value={card()?.lng ?? ""}
                    onChange={(e) =>
                      change((d) => {
                        const v = number(e.currentTarget.value);
                        if (d.cards[id]) {
                          if (v === undefined) delete d.cards[id].lng;
                          else d.cards[id].lng = v;
                        }
                      })
                    }
                  />
                  <button onClick={() => change((d) => delete d.cards[id])}>
                    delete
                  </button>
                </div>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}

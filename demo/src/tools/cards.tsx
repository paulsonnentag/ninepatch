import { For, from, Show } from "solid-js";
import { render } from "solid-js/web";
import type { Handle, Directory } from "@ninepatch/core";
import type { CanvasDoc } from "../types";

export default async function Cards(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<CanvasDoc>("doc");
  const selection = await dir.open<string | null>("selection");
  const dispose = render(
    () => <Board doc={doc} selection={selection} />,
    dom.value
  );
  dir.signal.addEventListener("abort", dispose);
}

function Board(props: {
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
  /** Typing a location geocodes it: the coordinates land in the card. */
  const locate = async (id: string, query: string) => {
    const coords = await geocode(query);
    if (!coords) return;
    change((d) => {
      const card = d.cards[id];
      if (card) {
        card.lat = coords.lat;
        card.lng = coords.lng;
      }
    });
  };

  return (
    <>
      <button class="add" onClick={add}>
        add card
      </button>
      <For each={Object.keys(state().cards)}>
        {(id) => {
          const card = () => state().cards[id];
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
                placeholder="type a place"
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
                onChange={(e) => void locate(id, e.currentTarget.value)}
              />
              <Show when={card()?.lat !== undefined}>
                <div class="latlng">
                  {card()!.lat!.toFixed(2)}, {card()!.lng!.toFixed(2)}
                </div>
              </Show>
              <Show when={selected() === id}>
                <button
                  class="remove"
                  onClick={() => change((d) => delete d.cards[id])}
                >
                  delete
                </button>
              </Show>
            </div>
          );
        }}
      </For>
    </>
  );
}

async function geocode(
  query: string
): Promise<{ lat: number; lng: number } | undefined> {
  if (!query.trim()) return undefined;
  const res = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query.trim())}&limit=1`
  );
  if (!res.ok) return undefined;
  const json = await res.json();
  const feature = json.features?.[0];
  if (!feature) return undefined;
  const [lng, lat] = feature.geometry.coordinates as [number, number];
  return { lat, lng };
}

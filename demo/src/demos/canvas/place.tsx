import { createSignal, For, from, Show } from "solid-js";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import type { PlaceDoc } from "../../types";

const DEFAULT_COLOR = "#e11d48";

export default async function Place(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<PlaceDoc>("document");

  const dispose = render(() => {
    const state = from(doc, doc.value);
    const [editing, setEditing] = createSignal(false);
    const [query, setQuery] = createSignal("");
    const [suggestions, setSuggestions] = createSignal<Suggestion[]>([]);
    let timer: number | undefined;

    const startEditing = () => {
      setQuery(state().title ?? "");
      setSuggestions([]);
      setEditing(true);
    };
    const stopEditing = () => {
      clearTimeout(timer);
      setEditing(false);
    };
    const search = (q: string) => {
      setQuery(q);
      clearTimeout(timer);
      timer = window.setTimeout(async () => {
        const found = await suggest(q);
        if (editing() && query() === q) setSuggestions(found);
      }, 250);
    };
    const rename = () => {
      if (!editing()) return; // a blur after a pick or escape
      doc.change((d) => (d.title = query()));
      stopEditing();
    };
    const pick = (s: Suggestion) => {
      doc.change((d) => {
        d.title = s.title;
        d.lat = s.lat;
        d.lng = s.lng;
      });
      stopEditing();
    };

    return (
      <Show when={state()}>
        <div class="card">
          <input
            type="color"
            class="dot"
            title="color"
            value={state().color ?? DEFAULT_COLOR}
            onInput={(e) =>
              doc.change((d) => (d.color = e.currentTarget.value))
            }
          />
          <Show
            when={editing()}
            fallback={
              <div class="title" onDblClick={startEditing}>
                {state().title || "untitled"}
              </div>
            }
          >
            <div class="editor">
              <input
                class="title"
                placeholder="type a place"
                value={query()}
                ref={(el) => setTimeout(() => el.select())}
                onInput={(e) => search(e.currentTarget.value)}
                onBlur={rename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") rename();
                  else if (e.key === "Escape") stopEditing();
                }}
              />
              <Show when={suggestions().length > 0}>
                <div class="suggestions">
                  <For each={suggestions()}>
                    {(s) => (
                      <button
                        onPointerDown={(e) => e.preventDefault()} // keep the input focused
                        onClick={() => pick(s)}
                      >
                        {s.title}
                        <Show when={s.detail}>
                          <span class="detail">{s.detail}</span>
                        </Show>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    );
  }, dom.value);
  dir.signal.addEventListener("abort", dispose);
}

type Suggestion = { title: string; detail: string; lat: number; lng: number };

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: Partial<
    Record<"name" | "city" | "state" | "country", string | undefined>
  >;
};

async function suggest(query: string): Promise<Suggestion[]> {
  if (!query.trim()) return [];
  const res = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query.trim())}&limit=5`
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { features?: PhotonFeature[] };
  return (json.features ?? []).flatMap((f) => {
    const p = f.properties;
    const title = p.name ?? p.city ?? p.country;
    if (!title) return [];
    const [lng, lat] = f.geometry.coordinates;
    const detail = [p.city, p.state, p.country]
      .filter((part): part is string => !!part && part !== title)
      .join(", ");
    return [{ title, detail, lat, lng }];
  });
}

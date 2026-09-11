import { from, Show } from "solid-js";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import type { PlaceDoc } from "../../types";

export default async function Place(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<PlaceDoc>("document");

  const dispose = render(() => {
    const state = from(doc, doc.value);
    const locate = async (query: string) => {
      const coords = await geocode(query);
      if (!coords) return;
      doc.change((d) => {
        d.lat = coords.lat;
        d.lng = coords.lng;
      });
    };
    return (
      <Show when={state()}>
        <div class="card">
          <input
            class="title"
            placeholder="type a place"
            value={state().title ?? ""}
            onInput={(e) =>
              doc.change((d) => (d.title = e.currentTarget.value))
            }
            onChange={(e) => void locate(e.currentTarget.value)}
          />
          <Show when={state().lat !== undefined}>
            <div class="latlng">
              {state().lat!.toFixed(2)}, {state().lng!.toFixed(2)}
            </div>
          </Show>
        </div>
      </Show>
    );
  }, dom.value);
  dir.signal.addEventListener("abort", dispose);
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

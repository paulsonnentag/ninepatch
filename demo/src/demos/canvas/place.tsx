import { from, Show } from "solid-js";
import { render } from "solid-js/web";
import type { Directory, Handle } from "@ninepatch/core";
import type { PlaceDoc } from "../../types";

/** One card, one document. The canvas hands it `document` (a link to its
 * own doc) and `dom` (the wrapper it drags); everything here edits the
 * place's doc and nothing else. */
export default async function Place(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<PlaceDoc>("document");
  const dispose = render(() => <Card doc={doc} />, dom.value);
  dir.signal.addEventListener("abort", dispose);
}

function Card(props: { doc: Handle<PlaceDoc> }) {
  const state = from(props.doc, props.doc.value);
  /** Typing a place geocodes it: the coordinates land in the doc. */
  const locate = async (query: string) => {
    const coords = await geocode(query);
    if (!coords) return;
    props.doc.change((d) => {
      d.lat = coords.lat;
      d.lng = coords.lng;
    });
  };
  return (
    <div class="card">
      <input
        class="title"
        placeholder="type a place"
        value={state().title ?? ""}
        onInput={(e) =>
          props.doc.change((d) => (d.title = e.currentTarget.value))
        }
        onChange={(e) => void locate(e.currentTarget.value)}
      />
      <Show when={state().lat !== undefined}>
        <div class="latlng">
          {state().lat!.toFixed(2)}, {state().lng!.toFixed(2)}
        </div>
      </Show>
    </div>
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

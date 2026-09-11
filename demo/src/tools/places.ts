import type { Directory } from "@ninepatch/core";
import type { CanvasDoc, Place, PlaceDoc } from "../types";

/** The aggregation, as a process: watch the canvas document, follow every
 * item's `docUrl`, and keep `places` mounted in the shared directory the
 * way the map wants it. Duck-typed: anything whose document has a title
 * and coordinates is a place — the map never learns what an item is. */
export default async function Places(dir: Directory) {
  const canvas = await dir.open<CanvasDoc>("demo/canvas");
  dir.mount("places", [] as Place[]);
  const places = await dir.open<Place[]>("places");

  type Watched = { url: string; close(): void; doc?: PlaceDoc };
  const watched = new Map<string, Watched>();

  const publish = () => {
    const list: Place[] = [];
    for (const id of [...watched.keys()].sort()) {
      const doc = watched.get(id)!.doc;
      if (doc?.title && doc.lat !== undefined && doc.lng !== undefined)
        list.push({ id, title: doc.title, lat: doc.lat, lng: doc.lng });
    }
    places.set(list);
  };

  const unsub = canvas.subscribe((d) => {
    const items = d.items ?? {};
    for (const [id, entry] of watched)
      if (items[id]?.docUrl !== entry.url) {
        entry.close();
        watched.delete(id);
        publish();
      }
    for (const [id, item] of Object.entries(items)) {
      if (!item.docUrl || watched.has(id)) continue;
      const entry: Watched = { url: item.docUrl, close: () => {} };
      watched.set(id, entry);
      void dir.open<PlaceDoc>(item.docUrl).then((view) => {
        if (watched.get(id) !== entry) return void view.close(); // gone meanwhile
        const stop = view.subscribe((doc) => {
          entry.doc = doc;
          publish();
        });
        entry.close = () => {
          stop();
          view.close();
        };
      });
    }
  });

  dir.signal.addEventListener("abort", () => {
    unsub();
    for (const entry of watched.values()) entry.close();
  });
}

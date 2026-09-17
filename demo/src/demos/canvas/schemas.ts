import type { Directory } from "@ninepatch/core";
import type { Color, Location } from "../../types";

// follows every link reachable from the canvas document and sorts what it
// finds by shape into `schemas/location` and `schemas/color`, keyed by URL
export default async function Schemas(dir: Directory) {
  const canvas = await dir.open<unknown>("canvas");
  dir.mount("schemas/location", {} as Record<string, Location>);
  dir.mount("schemas/color", {} as Record<string, Color>);
  const buckets = {
    location: await dir.open<Record<string, Location>>("schemas/location"),
    color: await dir.open<Record<string, Color>>("schemas/color"),
  };

  type Watched = { doc?: unknown; close(): void };
  const watched = new Map<string, Watched>();
  let root: unknown;

  const rebuild = () => {
    const reachable = new Set<string>();
    const queue = links(root);
    while (queue.length) {
      const url = queue.pop()!;
      if (reachable.has(url)) continue;
      reachable.add(url);
      queue.push(...links(watched.get(url)?.doc));
    }
    for (const [url, entry] of watched)
      if (!reachable.has(url)) {
        entry.close();
        watched.delete(url);
      }
    for (const url of reachable) if (!watched.has(url)) follow(url);
    publish();
  };

  const follow = (url: string) => {
    const entry: Watched = { close: () => {} };
    watched.set(url, entry);
    dir.open<unknown>(url).then(
      (view) => {
        if (watched.get(url) !== entry) return void view.close(); // gone meanwhile
        const stop = view.subscribe((doc) => {
          entry.doc = doc;
          rebuild();
        });
        entry.close = () => {
          stop();
          view.close();
        };
      },
      () => {} // nobody answered: a link to nothing
    );
  };

  const publish = () => {
    const location: Record<string, Location> = {};
    const color: Record<string, Color> = {};
    for (const url of [...watched.keys()].sort()) {
      const doc = watched.get(url)!.doc;
      const l = SCHEMAS.location(doc);
      if (l) location[url] = l;
      const c = SCHEMAS.color(doc);
      if (c) color[url] = c;
    }
    buckets.location.set(location);
    buckets.color.set(color);
  };

  const unsub = canvas.subscribe((doc) => {
    root = doc;
    rebuild();
  });

  dir.signal.addEventListener("abort", () => {
    unsub();
    for (const entry of watched.values()) entry.close();
  });
}

const SCHEMAS = {
  location(doc: unknown): Location | undefined {
    const d = doc as Record<string, unknown> | undefined;
    if (typeof d?.lat !== "number" || typeof d.lng !== "number") return;
    return {
      title: typeof d.title === "string" ? d.title : "",
      lat: d.lat,
      lng: d.lng,
    };
  },
  color(doc: unknown): Color | undefined {
    const d = doc as Record<string, unknown> | undefined;
    if (typeof d?.color !== "string") return;
    return { color: d.color };
  },
};

// every automerge URL anywhere in a value
function links(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (value.startsWith("automerge:")) out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) links(item, out);
  } else if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) links(item, out);
  }
  return out;
}

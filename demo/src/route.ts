/** §4 host: the route lives in the namespace as `location`, kept in step
 * with the browser's hash in both directions, and `selectedDoc` is a link
 * derived from it — retarget by navigating. */

import { derive, type Namespace, type Handle } from "@ninepatch/core";
import type { Route, Seed } from "./types";

export async function setupRoute(frame: Namespace, seed: Seed): Promise<void> {
  const parse = (hash: string): Route => {
    const match = /^#doc=(.+)$/.exec(hash);
    const url = match ? decodeURIComponent(match[1]) : "";
    return { docUrl: url.startsWith("automerge:") ? url : seed.notes }; // fall back so the first open succeeds
  };
  frame.mount("location", parse(window.location.hash));
  const location = (await frame.open<Route>("location")) as Namespace &
    Handle<Route>;
  addEventListener("hashchange", () =>
    location.set(parse(window.location.hash))
  );
  location.on("change", () =>
    history.replaceState(null, "", toHash(location.value.docUrl))
  );
  frame.mount(
    "selectedDoc",
    derive(location, (route) => route.docUrl)
  ); // a derived URL is a live link
}

export function toHash(docUrl: string): string {
  return `#doc=${encodeURIComponent(docUrl)}`;
}

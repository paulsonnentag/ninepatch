import { derive, type Directory, type Handle } from "@ninepatch/core";
import type { Route, Seed } from "./types";

const KEY = "ninepatch:demo:route";

export async function setupRoute(
  frame: Directory,
  seed: Seed
): Promise<Handle<Route>> {
  const stored = localStorage.getItem(KEY) ?? "";
  frame.mount("location", {
    docUrl: stored.startsWith("automerge:") ? stored : seed.notes, // fall back so the first open succeeds
  });
  const location = await frame.open<Route>("location");
  location.subscribe((route) => localStorage.setItem(KEY, route.docUrl));
  frame.mount(
    "selectedDoc",
    derive(location, (route) => route.docUrl)
  ); // a derived URL is a live link
  return location;
}

import { derive, type Directory } from "@ninepatch/core";
import type { Folder, Route as RouteDoc } from "../types";

const KEY = "ninepatch:demo:route";

/** The route lives in the directory as `location`, remembered in local
 * storage between visits; `selectedDoc` is a link derived from it —
 * retarget by navigating. Mounted into the shared directory, so the url
 * bar and the editor inherit both. */
export default async function Route(dir: Directory) {
  const stored = localStorage.getItem(KEY) ?? "";
  let docUrl = stored;
  if (!docUrl.startsWith("automerge:")) {
    const demo = await dir.open<Folder>("demo"); // fall back to the seed's notes so the first open succeeds
    docUrl = demo.value.notes;
  }
  dir.mount("location", { docUrl });
  const location = await dir.open<RouteDoc>("location");
  location.subscribe((route) => localStorage.setItem(KEY, route.docUrl));
  dir.mount(
    "selectedDoc",
    derive(location, (route) => route.docUrl)
  ); // a derived URL is a live link
}

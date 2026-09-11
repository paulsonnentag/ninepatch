import { derive, type Directory } from "@ninepatch/core";
import type { Folder } from "../../types";

const KEY = "ninepatch:demo:route";

// `url` is the part after the host, `/automerge:…`; `document` is the
// same thing as a two-way lens, so a rebind flows back into the url
export default async function Route(dir: Directory) {
  let path = localStorage.getItem(KEY) ?? "";
  if (path.startsWith("automerge:")) path = `/${path}`; // stored before the encoding
  if (!path.startsWith("/automerge:")) {
    const demo = await dir.open<Folder>("demo"); // fall back to the seed's notes so the first open succeeds
    path = `/${demo.value.notes}`;
  }
  dir.mount("url", path);
  const url = await dir.open<string>("url");
  url.subscribe((p) => localStorage.setItem(KEY, p));
  dir.mount(
    "document",
    derive(
      url,
      (p) => p.slice(1), // decoded; a URL string is a live link
      (doc: string) => url.set(`/${doc}`) // a rebind flows back into the url
    )
  );
}

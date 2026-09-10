import { derive, type Directory } from "@ninepatch/core";
import type { CanvasDoc, Place } from "../types";

/** The host-side derivation, as a process: opens the canvas through the
 * folder's link and mounts `places` — the list shaped the way the map
 * wants it — into the shared directory, where Canvas and Map inherit it. */
export default async function Places(dir: Directory) {
  const canvas = await dir.open<CanvasDoc>("demo/canvas");
  dir.mount(
    "places",
    derive(canvas, (d): Place[] =>
      Object.entries(d.cards).flatMap(([id, card]) =>
        card.lat != null && card.lng != null
          ? [{ id, title: card.title, lat: card.lat, lng: card.lng }]
          : []
      )
    )
  );
}

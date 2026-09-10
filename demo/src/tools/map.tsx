import { Map as LibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Directory } from "@ninepatch/core";
import type { Place } from "../types";

export default async function MapView(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const places = await dir.open<Place[]>("places");
  const selection = await dir.open<string | null>("selection");

  const frame = dom.value.appendChild(document.createElement("div"));
  frame.className = "map-frame"; // the box on the board; maplibre owns the inside
  const el = frame.appendChild(document.createElement("div"));
  el.className = "map";
  const map = new LibreMap({
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [13.388, 52.517],
    zoom: 9.5,
    container: el,
  });

  // one marker per place, kept in step with the derived list
  const markers = new Map<string, Marker>();
  const highlight = () => {
    for (const [id, marker] of markers)
      marker.getElement().classList.toggle("selected", selection.value === id);
  };
  const unsubPlaces = places.subscribe((list) => {
    const seen = new Set<string>();
    for (const place of list) {
      seen.add(place.id);
      let marker = markers.get(place.id);
      if (!marker) {
        const pin = document.createElement("button");
        pin.className = "pin";
        pin.addEventListener("click", () => selection.set(place.id));
        marker = new Marker({ element: pin })
          .setLngLat([place.lng, place.lat])
          .addTo(map);
        markers.set(place.id, marker);
      } else marker.setLngLat([place.lng, place.lat]);
      marker.getElement().title = place.title;
    }
    for (const [id, marker] of markers)
      if (!seen.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    highlight();
  });
  const unsubSelection = selection.subscribe(() => {
    highlight();
    const place = places.value.find((p) => p.id === selection.value);
    if (place) map.flyTo({ center: [place.lng, place.lat], zoom: 9.5 });
  });

  dir.signal.addEventListener("abort", () => {
    unsubPlaces();
    unsubSelection();
    map.remove();
    frame.remove();
  });
}

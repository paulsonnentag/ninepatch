import { Map as LibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Directory } from "@ninepatch/core";
import type { Color, Location, MapDoc } from "../../types";

const DEFAULT_COLOR = "#e11d48";

export default async function MapView(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<MapDoc>("document");
  const locations =
    await dir.open<Record<string, Location>>("schemas/location");
  const colors = await dir.open<Record<string, Color>>("schemas/color");
  const selection = await dir.open<string[]>("selection");

  const frame = dom.value.appendChild(document.createElement("div"));
  frame.className = "map-frame"; // the box on the board; maplibre owns the inside
  const el = frame.appendChild(document.createElement("div"));
  el.className = "map";
  const view = doc.value;
  const map = new LibreMap({
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [view.center.lng, view.center.lat],
    zoom: view.zoom,
    container: el,
  });
  map.on("moveend", () => {
    const { lng, lat } = map.getCenter();
    const zoom = map.getZoom();
    doc.change((d) => {
      d.center = { lng, lat };
      d.zoom = zoom;
    });
  });

  // one marker per location, keyed by document URL; the color bucket and
  // the selection are joined by that same URL
  const markers = new Map<string, Marker>();
  const paint = () => {
    for (const [url, marker] of markers) {
      const pin = marker.getElement();
      pin.style.background = colors.value[url]?.color ?? DEFAULT_COLOR;
      pin.classList.toggle("selected", selection.value.includes(url));
    }
  };
  const unsubLocations = locations.subscribe((list) => {
    for (const [url, place] of Object.entries(list)) {
      let marker = markers.get(url);
      if (!marker) {
        const pin = document.createElement("button");
        pin.className = "pin";
        pin.addEventListener("click", (e) => {
          const current = selection.value;
          selection.set(
            e.shiftKey
              ? current.includes(url)
                ? current.filter((u) => u !== url)
                : [...current, url]
              : [url]
          );
        });
        marker = new Marker({ element: pin })
          .setLngLat([place.lng, place.lat])
          .addTo(map);
        markers.set(url, marker);
      } else marker.setLngLat([place.lng, place.lat]);
      marker.getElement().title = place.title;
    }
    for (const [url, marker] of markers)
      if (!(url in list)) {
        marker.remove();
        markers.delete(url);
      }
    paint();
  });
  const unsubColors = colors.subscribe(paint);
  const unsubSelection = selection.subscribe((urls) => {
    paint();
    // fly to the most recently selected one that is on the map
    const place = [...urls]
      .reverse()
      .map((u) => locations.value[u])
      .find(Boolean);
    if (place) map.flyTo({ center: [place.lng, place.lat] });
  });

  dir.signal.addEventListener("abort", () => {
    unsubLocations();
    unsubColors();
    unsubSelection();
    map.remove();
    frame.remove();
  });
}

import { Map as LibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { derive, type Directory } from "@ninepatch/core";
import type { LocalPointer, MapSurfaceDoc, SurfaceShape } from "../../types";
import { bounds } from "./geometry";

// A shape that is a surface: rio in a rio window. The map consumes the
// `ui` of the surface it sits on, and serves its own to its shapes: the
// projected layer as `ui/dom`, the pointer translated into map units —
// pixels at the origin zoom, measured from the origin — as `ui/pointer`,
// and its own document as `ui/surface`, with the surface below mounted
// into it as `parent`. Then it runs the same Surface the board runs.
export default async function MapSurface(dir: Directory) {
  const dom = await dir.open<Element>("ui/dom");
  const doc = await dir.open<MapSurfaceDoc>("document");
  const shape = await dir.open<SurfaceShape>("shape");
  const outer = await dir.open<LocalPointer>("ui/pointer"); // in the units of the surface below us

  const box = bounds(shape.value.outline);
  const frame = dom.value.appendChild(document.createElement("div"));
  frame.className = "map-surface";
  Object.assign(frame.style, {
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  });
  const el = frame.appendChild(document.createElement("div"));
  el.className = "map";
  const layer = frame.appendChild(document.createElement("div"));
  layer.className = "layer";

  const { origin } = doc.value;
  const map = new LibreMap({
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [origin.lng, origin.lat],
    zoom: origin.zoom,
    container: el,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });
  map.touchZoomRotate.disableRotation();

  const scale = () => 2 ** (map.getZoom() - origin.zoom);
  const anchor = () => map.project([origin.lng, origin.lat]); // where the origin is on screen, in frame pixels
  const place = () => {
    const o = anchor();
    layer.style.transform = `translate(${o.x}px, ${o.y}px) scale(${scale()})`;
  };
  map.on("move", place);
  place();

  // this surface: its own document, with the one below mounted in as
  // `parent` — so `ui/surface/parent` walks back out, level by level
  doc.mount("parent", await dir.open("ui/surface"));

  const inner = dir.fork("surface");
  inner.mount("ui/dom", layer);
  inner.mount(
    "ui/pointer",
    derive<LocalPointer, LocalPointer>(outer, (p) => {
      if (!p) return null;
      const { x, y } = shape.value; // where this shape sits on the surface below
      const o = anchor();
      const k = scale();
      return {
        x: (p.x - x - box.x - o.x) / k,
        y: (p.y - y - box.y - o.y) / k,
      };
    })
  );
  inner.mount("ui/surface", doc);
  inner.spawn("Surface", "./demos/whiteboard/surface.tsx");

  dir.signal.addEventListener("abort", () => {
    map.remove();
    frame.remove();
  });
}

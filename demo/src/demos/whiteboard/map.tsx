import { Map as LibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { derive, wrap, type Directory } from "@ninepatch/core";
import type { LocalPointer, MapShape, SurfaceDoc, Tool } from "../../types";
import { bounds } from "./geometry";
import { surface } from "./surface";

// A shape that is a surface: rio in a rio window. Its own record becomes
// the surface its shapes sit on — the pointer of the surface below
// translated into map units (pixels at the origin zoom, measured from the
// origin), and the scale of a map unit on screen, which changes as the
// map zooms — plus that surface as `parent`, so the chain leads back up.
// All on the record, where the surface below reads them at shapes/<id>/…
// and a pen finds its way down to draw here in map units. With a tool
// selected the map holds still.
export default async function MapSurface(dir: Directory) {
  const shape = await dir.open<MapShape>("document");
  const parent = await dir.open<SurfaceDoc>("parent"); // the surface below, by a name I won't redefine
  const outer = await dir.open<LocalPointer>("parent/pointer"); // in its units
  const outerScale = await dir.open<number>("parent/scale");
  const dom = await dir.open<HTMLElement>("dom");
  const tool = await dir.open<Tool>("tool");

  const { origin, outline } = shape.value;
  const box = bounds(outline);
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
  const zoom = wrap(scale()); // the same number, as a handle: fires on move
  const place = () => {
    const o = anchor();
    layer.style.transform = `translate(${o.x}px, ${o.y}px) scale(${scale()})`;
    zoom.set(scale());
  };
  map.on("move", place);
  place();

  const unsubscribe = tool.subscribe((t) => {
    if (t) map.dragPan.disable();
    else map.dragPan.enable();
    frame.classList.toggle("drawing", !!t);
  });

  dir.signal.addEventListener("abort", () => {
    unsubscribe();
    map.remove();
    frame.remove();
  });

  // this record as a surface, for my shapes and for whoever reads the one below
  shape.mount("parent", parent);
  await surface(dir, shape, layer, {
    pointer: derive<LocalPointer, LocalPointer>(outer, (p) => {
      if (!p) return null;
      const { x, y } = shape.value; // where this shape sits on the surface below
      const o = anchor();
      const k = scale();
      return {
        ...p,
        x: (p.x - x - box.x - o.x) / k,
        y: (p.y - y - box.y - o.y) / k,
      };
    }),
    scale: derive(zoom, (k) => k * outerScale.value), // a map unit on screen: my zoom times the surface below's scale
  });
}

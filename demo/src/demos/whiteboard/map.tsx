import { Map as LibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { For, from, onCleanup } from "solid-js";
import { render } from "solid-js/web";
import { derive, wrap, type Directory, type Opened } from "@ninepatch/core";
import type {
  LocalPointer,
  MapPointer,
  MapShape,
  Selected,
  Shape,
} from "../../types";
import { bounds } from "./geometry";
import { componentName } from "./tools";

// A shape that is a surface: rio in a rio window. It reads the pointer
// and scale of the surface it sits on through `surface`, and makes its
// own record a surface in turn: the pointer translated into map units
// (pixels at the origin zoom, measured from the origin) and the scale of
// a map unit on screen, which changes as the map zooms, mounted onto the
// record — where the surface it sits on reads them at shapes/<id>/…, and
// a pen finds its way down to draw here in map units. Its shapes are
// placed on a layer that moves with the projection, each a fork with
// this record as `surface`. With a pen selected the map holds still.
export default async function MapSurface(dir: Directory) {
  const shape = await dir.open<MapShape>("document");
  const outer = await dir.open<LocalPointer>("surface/pointer"); // the surface I sit on, in its units
  const outerScale = await dir.open<number>("surface/scale");
  const dom = await dir.open<HTMLElement>("dom");
  const selected = await dir.open<Selected>("selected");

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

  const unsubscribe = selected.subscribe((s) => {
    if (s) map.dragPan.disable();
    else map.dragPan.enable();
    frame.classList.toggle("drawing", !!s);
  });

  // this record as a surface
  shape.mount(
    "pointer",
    derive<LocalPointer, MapPointer>(outer, (p) => {
      if (!p) return null;
      const { x, y } = shape.value; // where this shape sits on the surface I sit on
      const fx = p.x - x - box.x; // in the frame's pixels
      const fy = p.y - y - box.y;
      const o = anchor();
      const k = scale();
      const { lng, lat } = map.unproject([fx, fy]);
      return {
        ...p,
        x: (fx - o.x) / k,
        y: (fy - o.y) / k,
        lng: round(lng, 6),
        lat: round(lat, 6),
      };
    })
  );
  shape.mount(
    "scale",
    derive(zoom, (k) => k * outerScale.value) // a map unit on screen: my zoom times the scale I sit on
  );

  const dispose = render(() => {
    const state = from(shape, shape.value);
    return (
      <For each={Object.keys(state().shapes)}>
        {(id) => {
          const s = () => state().shapes[id] as Shape | undefined;
          const wrapper = (
            <div
              class="shape"
              style={{
                transform: `translate(${s()?.x ?? 0}px, ${s()?.y ?? 0}px)`,
              }}
            />
          ) as HTMLDivElement;

          const child = dir.fork(id);
          child.mount("dom", wrapper);
          child.mount("surface", shape);
          let own: Opened<Shape> | undefined;
          (async () => {
            own = await dir.open<Shape>(["document", "shapes", id]);
            child.mount("document", own);
            const url = own.value.componentUrl;
            child
              .spawn(componentName(url), url)
              .terminated.catch((e: unknown) => {
                if (!child.signal.aborted) wrapper.textContent = String(e);
              });
          })().catch((e: unknown) => {
            if (!child.signal.aborted) wrapper.textContent = String(e);
          });
          onCleanup(() => {
            child.close();
            own?.close();
          });
          return wrapper;
        }}
      </For>
    );
  }, layer);

  dir.signal.addEventListener("abort", () => {
    dispose();
    unsubscribe();
    map.remove();
    frame.remove();
  });
}

function round(n: number, places: number): number {
  const k = 10 ** places;
  return Math.round(n * k) / k;
}

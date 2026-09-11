import type { AnyDocumentId } from "@automerge/automerge-repo";
import { frame, moduleUrl, repo, seed, seedCanvasItems } from "../../boot";
import { createComponent, Section } from "../../harness";
import type { CanvasDoc } from "../../types";
import canvasSource from "./canvas.tsx?raw";
import placeSource from "./place.tsx?raw";
import mapSource from "./map.tsx?raw";
import placesSource from "./places.ts?raw";

export function CanvasDemo() {
  return (
    <Section
      title="Canvas and map"
      chain={[frame, root]}
      reset={reset}
      sources={[
        { name: "canvas.tsx", code: canvasSource },
        { name: "place.tsx", code: placeSource },
        { name: "map.tsx", code: mapSource },
        { name: "places.ts", code: placesSource },
      ]}
      prose={
        <p>
          The canvas document stores a <code>componentUrl</code>, a{" "}
          <code>docUrl</code>, and a position per item, so the canvas only drags
          wrappers and spawns whatever the document names: every place card is
          its own process editing its own document, and the map is just another
          component on the canvas.
        </p>
      }
    >
      <Canvas dir={root} document={seed.canvas} />
    </Section>
  );
}

async function reset() {
  const doc = await repo.find<CanvasDoc>(seed.canvas as AnyDocumentId);
  const items = seedCanvasItems(); // fresh place docs, same set
  doc.change((d) => {
    for (const id of Object.keys(d.items)) delete d.items[id];
    Object.assign(d.items, items);
  });
}

const root = frame.fork("root"); // "root" loosely: this demo's world
root.mount("selection", null as string | null); // a plain value; never touches a document
await root.spawn("Places", moduleUrl("canvas/places.ts")).terminated; // follows the items' docs, mounts `places`
const Canvas = createComponent<{ document: string }>(
  moduleUrl("canvas/canvas.tsx")
);

import type { AnyDocumentId } from "@automerge/automerge-repo";
import { frame, moduleUrl, repo, seed, seedCanvasItems } from "../../boot";
import { createComponent, Section } from "../../harness";
import type { CanvasDoc } from "../../types";
import canvasSource from "./canvas.tsx?raw";
import placeSource from "./place.tsx?raw";
import mapSource from "./map.tsx?raw";
import schemasSource from "./schemas.ts?raw";

export function CanvasDemo() {
  return (
    <Section
      title="Canvas"
      chain={[frame, root]}
      reset={reset}
      sources={[
        { name: "canvas.tsx", code: canvasSource },
        { name: "place.tsx", code: placeSource },
        { name: "map.tsx", code: mapSource },
        { name: "schemas.ts", code: schemasSource },
      ]}
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
root.mount("canvas", seed.canvas); // a link: the canvas document, for anything running here
root.mount("selection", [] as string[]); // the selected items' document URLs; a plain value, never touches a document
await root.spawn("Schemas", moduleUrl("canvas/schemas.ts")).terminated; // follows every link from the canvas, mounts `schemas/*`
const Canvas = createComponent<{ document: string }>(
  moduleUrl("canvas/canvas.tsx")
);

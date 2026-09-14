import type { AnyDocumentId } from "@automerge/automerge-repo";
import { frame, moduleUrl, repo, seed, seedWhiteboardShapes } from "../../boot";
import { Section } from "../../harness";
import type { SurfaceDoc } from "../../types";
import surfaceSource from "./surface.tsx?raw";
import inputSource from "./input.ts?raw";
import mapSource from "./map.tsx?raw";
import geometrySource from "./geometry.ts?raw";

export function WhiteboardDemo() {
  return (
    <Section
      title="Whiteboard"
      chain={[frame, root]}
      reset={reset}
      sources={[
        { name: "surface.tsx", code: surfaceSource },
        { name: "input.ts", code: inputSource },
        { name: "map.tsx", code: mapSource },
        { name: "geometry.ts", code: geometrySource },
      ]}
      prose={
        <p>
          A surface is a process that gives every shape a namespace under{" "}
          <code>ui</code>: its element as <code>ui/dom</code>, the pointer as{" "}
          <code>ui/pointer</code> — recorded once, at the root — and{" "}
          <code>ui/surface</code>, the surface it sits on: its document, with
          the surface below mounted into it as <code>parent</code>. The map
          overrides all three for its own shapes — it projects the pointer into
          map units and runs the same Surface on its layer — and{" "}
          <code>ui/surface/parent</code> still walks back out to the board. Pan
          or zoom the map and watch the same pointer read differently in each.
        </p>
      }
    >
      {board}
    </Section>
  );
}

async function reset() {
  const doc = await repo.find<SurfaceDoc>(seed.whiteboard as AnyDocumentId);
  const shapes = seedWhiteboardShapes(); // a fresh map document
  doc.change((d) => {
    for (const id of Object.keys(d.shapes)) delete d.shapes[id];
    Object.assign(d.shapes, shapes);
  });
}

const root = frame.fork("root"); // "root" loosely: this demo's world
const board = document.createElement("div");
board.className = "whiteboard";
root.mount("ui/dom", board); // the recorder measures it, the surface draws in it: one coordinate space
await root.spawn("Input", moduleUrl("whiteboard/input.ts")).terminated; // mounts `ui/pointer`
const surface = root.fork("Whiteboard");
// the board's surface object: its document, with nothing mounted in — the root has no parent
surface.mount("ui/surface", await surface.open<SurfaceDoc>(seed.whiteboard));
surface.spawn("Surface", moduleUrl("whiteboard/surface.tsx"));

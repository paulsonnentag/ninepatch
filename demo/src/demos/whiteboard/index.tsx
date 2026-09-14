import type { AnyDocumentId } from "@automerge/automerge-repo";
import { frame, moduleUrl, repo, seed, seedWhiteboardShapes } from "../../boot";
import { Section } from "../../harness";
import type { SurfaceDoc, Tool } from "../../types";
import canvasSource from "./canvas.tsx?raw";
import mapSource from "./map.tsx?raw";
import surfaceSource from "./surface.tsx?raw";
import penSource from "./pen.tsx?raw";
import eraserSource from "./eraser.tsx?raw";
import lineSource from "./line.tsx?raw";
import inputSource from "./input.ts?raw";
import geometrySource from "./geometry.ts?raw";

export function WhiteboardDemo() {
  return (
    <Section
      title="Whiteboard"
      chain={[frame, root]}
      reset={reset}
      sources={[
        { name: "canvas.tsx", code: canvasSource },
        { name: "map.tsx", code: mapSource },
        { name: "surface.tsx", code: surfaceSource },
        { name: "pen.tsx", code: penSource },
        { name: "eraser.tsx", code: eraserSource },
        { name: "line.tsx", code: lineSource },
        { name: "input.ts", code: inputSource },
        { name: "geometry.ts", code: geometrySource },
      ]}
      prose={
        <p>
          Rio, one level at a time. The root has a <code>pointer</code> — a
          recorder writes it, in the board's pixels — and nothing else. The
          canvas is a component below it that makes its document a{" "}
          <code>surface</code>: a directory, with <code>dom</code> and the{" "}
          <code>pointer</code> in its units mounted onto it, and every shape in
          it placed as a component of its own — its record as{" "}
          <code>document</code>, opened through the surface, and the surface as{" "}
          <code>parent</code>. The map is one of those shapes and a surface in
          turn: it mounts its layer, the pointer in map units and its{" "}
          <code>parent</code> onto its own record, so the canvas reads them at{" "}
          <code>surface/shapes/map/pointer</code> and the chain leads back up.
          The pens and the eraser are shapes on the canvas too; clicking one
          sets <code>tool</code> at the top, and whichever surface the pointer
          is down on — the canvas, or the map when it is under the pointer —
          draws with it in its own units.
        </p>
      }
    >
      {board}
    </Section>
  );
}

async function reset() {
  const doc = await repo.find<SurfaceDoc>(seed.whiteboard as AnyDocumentId);
  const shapes = seedWhiteboardShapes();
  doc.change((d) => {
    for (const id of Object.keys(d.shapes)) delete d.shapes[id];
    Object.assign(d.shapes, shapes);
  });
}

const root = frame.fork("root");
const board = document.createElement("div");
board.className = "whiteboard";
root.mount("dom", board);
await root.spawn("Input", moduleUrl("whiteboard/input.ts")).terminated; // mounts `pointer`, in the board's pixels

const canvas = root.fork("canvas");
canvas.mount("document", seed.whiteboard); // a link: the canvas document
canvas.mount("tool", null as Tool); // the selected pen, for every surface below
canvas.spawn("Canvas", moduleUrl("whiteboard/canvas.tsx"));

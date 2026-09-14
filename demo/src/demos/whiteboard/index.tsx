import type { AnyDocumentId } from "@automerge/automerge-repo";
import { frame, moduleUrl, repo, seed, seedWhiteboardShapes } from "../../boot";
import { Section } from "../../harness";
import type { Selected, SurfaceDoc } from "../../types";
import canvasSource from "./canvas.tsx?raw";
import mapSource from "./map.tsx?raw";
import penSource from "./pen.tsx?raw";
import eraserSource from "./eraser.tsx?raw";
import toolsSource from "./tools.ts?raw";
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
        { name: "pen.tsx", code: penSource },
        { name: "eraser.tsx", code: eraserSource },
        { name: "tools.ts", code: toolsSource },
        { name: "line.tsx", code: lineSource },
        { name: "input.ts", code: inputSource },
        { name: "geometry.ts", code: geometrySource },
      ]}
      prose={
        <p>
          Rio, one level at a time. The root has a <code>pointer</code> — a
          recorder writes it, in the board's pixels — and nothing else. The
          canvas is a component below it whose document is a surface — a purely
          logical thing: the shapes in the record, and mounted onto it the{" "}
          <code>pointer</code> in its units and the <code>scale</code> of a unit
          on screen. Every shape is placed as a component of its own: a fork
          with its record as <code>document</code> and the surface it sits on as{" "}
          <code>surface</code>. The map is one of those shapes and a surface in
          turn: it reads <code>surface/pointer</code>, mounts the pointer in map
          units and its zoom as the scale onto its own record — so the canvas
          reads them at <code>document/shapes/map/pointer</code> — and places
          its shapes with that record as their <code>surface</code>. The pens
          and the eraser are shapes on the canvas too, and they do the drawing:
          clicking one puts its record in <code>selected</code> at the top, and
          while the pointer is down the pen follows <code>surface</code> down —
          into any shape under the pointer that publishes a <code>pointer</code>{" "}
          of its own — and writes a line into the deepest surface's document, in
          its units, its width divided by its scale so the ink is the pen's
          width on screen however far the map is zoomed.
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
canvas.mount("selected", null as Selected); // the selected shape — a pen — for every surface below
canvas.spawn("Canvas", moduleUrl("whiteboard/canvas.tsx"));

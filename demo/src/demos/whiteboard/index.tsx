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

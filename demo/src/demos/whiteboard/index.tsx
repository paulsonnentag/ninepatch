import type { AnyDocumentId } from "@automerge/automerge-repo";
import { frame, moduleUrl, repo, seed, seedWhiteboardShapes } from "../../boot";
import { Section } from "../../harness";
import type { Selected, SurfaceDoc } from "../../types";

export function WhiteboardDemo() {
  return (
    <Section title="Whiteboard" chain={[frame, root]} reset={reset}>
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

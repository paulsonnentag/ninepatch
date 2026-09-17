import type { AnyDocumentId } from "@automerge/automerge-repo";
import { frame, moduleUrl, repo, seed, seedCanvasItems } from "../../boot";
import { createComponent, Section } from "../../harness";
import type { CanvasDoc } from "../../types";

export function CanvasDemo() {
  return (
    <Section title="Canvas" chain={[frame, root]} reset={reset} about={about}>
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

const about = (
  <>
    <p>
      Entries higher up are inherited by every fork below, so what the whole
      demo shares goes on <code>root</code>. The canvas forks one directory per
      item and mounts that item's document as <code>document</code>: the
      component inside can't tell it is on a canvas at all.
    </p>
    <pre>{`frame/
└── root/                     this demo's world
    ├── canvas    →           the canvas document (a link)
    ├── selection             the selected items' URLs: a plain value
    ├── schemas/              kept by the Schemas process: every document
    │   ├── location          the canvas links to, sorted by shape
    │   └── color
    └── canvas/               the Canvas tool
        ├── dom
        ├── document  →       the canvas document
        └── <item id>/        one fork per item, the item's whole world
            ├── dom           its draggable wrapper
            └── document  →   items[id].docUrl, re-followed when it changes

const root = frame.fork("root");
root.mount("canvas", seed.canvas);
root.mount("selection", [] as string[]);
root.spawn("Schemas", moduleUrl("canvas/schemas.ts"));

// canvas.tsx, for every item on it
const child = dir.fork(id);
child.mount("dom", el);
child.mount("document", field(doc, ["items", id, "docUrl"]));
child.spawn(name, item.componentUrl);`}</pre>
  </>
);

const root = frame.fork("root"); // "root" loosely: this demo's world
root.mount("canvas", seed.canvas); // a link: the canvas document, for anything running here
root.mount("selection", [] as string[]); // the selected items' document URLs; a plain value, never touches a document
await root.spawn("Schemas", moduleUrl("canvas/schemas.ts")).terminated; // follows every link from the canvas, mounts `schemas/*`
const Canvas = createComponent<{ document: string }>(
  moduleUrl("canvas/canvas.tsx")
);

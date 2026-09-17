import type { AnyDocumentId } from "@automerge/automerge-repo";
import { derive } from "@ninepatch/core";
import {
  frame,
  moduleUrl,
  repo,
  seed,
  seedLayoutWindows,
  seedLetter,
  seedRecipe,
} from "../../boot";
import { createComponent, Section } from "../../harness";
import type { Folder, LayoutDoc, MarkdownDoc } from "../../types";
import wmSource from "./wm.tsx?raw";
import folderSource from "./folder.tsx?raw";
import pickerSource from "./picker.tsx?raw";
import editorSource from "./editor.tsx?raw";
import previewSource from "./preview.tsx?raw";
import pdfSource from "./pdf.tsx?raw";
import wordcountSource from "./wordcount.tsx?raw";
import statsSource from "./stats.tsx?raw";
import toolsSource from "./tools.ts?raw";

export function ViewsDemo() {
  return (
    <Section
      title="An arrangement of windows is a view"
      chain={[frame, root]}
      reset={reset}
      widths={[3, 1]}
      sources={[
        { name: "wm.tsx", code: wmSource },
        { name: "folder.tsx", code: folderSource },
        { name: "picker.tsx", code: pickerSource },
        { name: "editor.tsx", code: editorSource },
        { name: "preview.tsx", code: previewSource },
        { name: "pdf.tsx", code: pdfSource },
        { name: "wordcount.tsx", code: wordcountSource },
        { name: "stats.tsx", code: statsSource },
        { name: "tools.ts", code: toolsSource },
      ]}
      prose={
        <p>
          The window manager's document is a <code>layout</code>: which tool
          runs in each window, where it sits, and which document it shows. Each
          window is a fork with the tool spawned in it; a window with a document
          of its own has it pinned into the fork, and a window with the{" "}
          <i>current document</i> sticker mounts nothing, so its{" "}
          <code>document</code> falls through to whatever the layout was placed
          in. On the left the layout sits in a directory holding the notes; on
          the right the same layout, live, sits in one whose{" "}
          <code>document</code> follows the picker — and only the stickered
          windows follow along. Drag the sticker in the folder view to change
          which ones do, and swap tools in the title bars.
        </p>
      }
    >
      <div class="views">
        <div class="views-pane">
          <h4>the layout, on the notes</h4>
          <Wm dir={editing} />
        </div>
        <div class="views-pane">
          <h4>its folder</h4>
          <FolderView dir={editing} />
        </div>
        <div class="views-pane">
          <h4>the same layout, on a pick</h4>
          <Picker dir={reader} />
          <Wm dir={reader} />
        </div>
      </div>
    </Section>
  );
}

async function reset() {
  const layout = await repo.find<LayoutDoc>(seed.layout as AnyDocumentId);
  const windows = seedLayoutWindows(seed.notes);
  layout.change((d) => {
    for (const id of Object.keys(d.windows)) delete d.windows[id];
    Object.assign(d.windows, windows);
  });
  const recipe = await repo.find<MarkdownDoc>(seed.recipe as AnyDocumentId);
  const letter = await repo.find<MarkdownDoc>(seed.letter as AnyDocumentId);
  recipe.change((d) => (d.content = seedRecipe()));
  letter.change((d) => (d.content = seedLetter()));
  picked.set("recipe");
}

const examples: Folder = {
  notes: seed.notes,
  notes2: seed.notes2,
  recipe: seed.recipe,
  letter: seed.letter,
};

const root = frame.fork("views");
root.mount("layout", seed.layout); // a link: the arrangement, for both sides
root.mount("examples", examples); // the documents the picker knows, by name

const editing = root.fork("editing");
editing.mount("document", seed.notes); // the layout is built on the notes

const reader = root.fork("reader");
reader.mount("picked", "recipe"); // a name, not a url: readable as itself
const picked = await reader.open<string>("picked");
reader.mount(
  "document",
  derive(picked, (name) => examples[name]) // a link that follows the pick
);

const Wm = createComponent(moduleUrl("views/wm.tsx"));
const FolderView = createComponent(moduleUrl("views/folder.tsx"));
const Picker = createComponent(moduleUrl("views/picker.tsx"));

import type { AnyDocumentId } from "@automerge/automerge-repo";
import { derive, type Directory } from "@ninepatch/core";
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

export function ViewsDemo() {
  return (
    <Section
      title="An arrangement of windows is a view"
      chain={[frame, root]}
      reset={reset}
      widths={[3, 1]}
    >
      <div class="views">
        <div class="views-pane">
          <h4>the layout, on the notes</h4>
          {editingBox}
        </div>
        <div class="views-pane">
          <h4>the workspace, as a folder</h4>
          <FolderView dir={editing} workspace={editing} />
        </div>
        <div class="views-pane">
          <h4>the same layout, on a pick</h4>
          <Picker dir={reader} />
          {readerBox}
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

// a workspace: a directory the manager runs at, so what it mounts —
// `surfaces/<id>`, one bind per window — is the workspace's to list
function workspace(name: string): [Directory, HTMLDivElement] {
  const dir = root.fork(name);
  const box = document.createElement("div");
  box.className = "tool";
  dir.mount("dom", box);
  dir.spawn("Wm", moduleUrl("views/wm.tsx")).terminated.catch((e: unknown) => {
    if (!dir.signal.aborted) box.textContent = String(e);
  });
  return [dir, box];
}

const [editing, editingBox] = workspace("editing");
editing.mount("document", seed.notes); // the layout is built on the notes

const [reader, readerBox] = workspace("reader");
reader.mount("picked", "recipe"); // a name, not a url: readable as itself
const picked = await reader.open<string>("picked");
reader.mount(
  "document",
  derive(picked, (name) => examples[name]) // a link that follows the pick
);

const FolderView = createComponent<{ workspace: Directory }>(
  moduleUrl("views/folder.tsx")
);
const Picker = createComponent(moduleUrl("views/picker.tsx"));

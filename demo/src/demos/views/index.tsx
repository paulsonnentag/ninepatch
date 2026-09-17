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

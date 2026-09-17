import type { AnyDocumentId } from "@automerge/automerge-repo";
import { derive, field, wrap, type Directory } from "@ninepatch/core";
import { frame, moduleUrl, repo } from "../../boot";
import { createComponent, Section } from "../../harness";
import type { DocumentsDoc, Workspace } from "../../types";
import { findOrCreateDocuments } from "../frame/documents";
import { findOrCreateLayout, resetLayout } from "./layout";
import { componentName } from "./tools";

export function ViewsDemo() {
  return (
    <Section
      title="An arrangement of windows is a view"
      chain={[frame, root]}
      reset={reset}
      inspector={false}
    >
      <div class="views">
        <div class="views-pane">
          <h4>the layout, on the first note</h4>
          {editingBox}
        </div>
        <div class="views-pane">
          <h4>the workspace, as a folder</h4>
          <FolderView dir={editing} workspace={editing} />
        </div>
        <div class="views-reuse">
          <h4>the same layout as the window manager of a frame</h4>
          <div class="frame-box">
            <aside class="frame-side">{sidebarBox}</aside>
            <div class="frame-main">{managerBox}</div>
          </div>
        </div>
      </div>
    </Section>
  );
}

async function reset() {
  await resetLayout(layout, pinned);
  workspace.set(fresh());
}

const fresh = (): Workspace => ({
  selected: { document: first, view: "" },
  open: [first],
  surfaces: {},
});

// a box for `dir`, with the module at `url` running in it
function run(dir: Directory, url: string): HTMLDivElement {
  const box = document.createElement("div");
  box.className = "slot";
  dir.mount("dom", box);
  dir.spawn(componentName(url), url).terminated.catch((e: unknown) => {
    if (!dir.signal.aborted) box.textContent = String(e);
  });
  return box;
}

const WM = moduleUrl("views/wm.tsx");

// the window management demo's documents: the layout is built on the
// first note, and its pinned window holds the second
const documents = findOrCreateDocuments();
const notes = (await repo.find<DocumentsDoc>(documents as AnyDocumentId)).doc()
  .documents;
const first = notes[0];
const pinned = notes[1] ?? first;
const layout = findOrCreateLayout(pinned);

const root = frame.fork("views");
root.mount("layout", layout); // a link: the arrangement, for every manager below

// a workspace with the first note as `document`; the manager runs at it,
// so `surfaces/<id>` is the workspace's to list
const editing = root.fork("editing");
editing.mount("document", first);
const editingBox = run(editing, WM);

// the same directory a frame gives its manager: the documents list as
// `document` at the top, a `workspace` the sidebar and the manager share
// — and the manager's `document` is whatever the sidebar selected
const reuse = root.fork("reuse");
const workspace = wrap<Workspace>(fresh());
reuse.mount("document", documents);
reuse.mount("workspace", workspace);
const sidebarBox = run(reuse.fork("sidebar"), moduleUrl("frame/sidebar.tsx"));
const manager = reuse.fork("manager");
manager.mount(
  "document",
  derive(field<string>(workspace, ["selected", "document"]), (d) => d || first)
);
const managerBox = run(manager, WM);

const FolderView = createComponent<{ workspace: Directory }>(
  moduleUrl("views/folder.tsx")
);

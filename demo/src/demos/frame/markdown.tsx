import { EditorView } from "@codemirror/view";
import { minimalSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { field, type Directory } from "@ninepatch/core";
import { bindText } from "@ninepatch/codemirror";
import type { MarkdownDoc, Selection, Workspace } from "../../types";
import { docLinks } from "../browser/markdown";

const VIEW = "./demos/frame/markdown.tsx"; // what a linked note opens in: this

// a note in a window: its document stays put; a link click changes what
// the workspace has selected, and the window manager opens or focuses it
export default async function Markdown(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<MarkdownDoc>("document");
  const workspace = await dir.open<Workspace>("workspace");
  const selected = field<Selection>(workspace, ["selected"]);

  const host = dom.value.appendChild(document.createElement("div"));
  host.className = "editor";
  const view = new EditorView({
    parent: host,
    extensions: [
      minimalSetup,
      markdown(),
      EditorView.lineWrapping,
      docLinks((path) => selected.set({ document: path.slice(1), view: VIEW })),
    ],
  });
  const unbind = bindText(view, doc, ["content"]);
  dir.signal.addEventListener("abort", () => {
    unbind();
    view.destroy();
    host.remove();
  });
}

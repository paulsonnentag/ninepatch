import { EditorView } from "@codemirror/view";
import { minimalSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import type { Directory } from "@ninepatch/core";
import { bindText } from "@ninepatch/codemirror";
import type { MarkdownDoc } from "../../types";

export default async function Editor(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<MarkdownDoc>("document"); // follows the link, and keeps following

  const host = dom.value.appendChild(document.createElement("div"));
  host.className = "editor fill";
  const view = new EditorView({
    parent: host,
    extensions: [minimalSetup, markdown(), EditorView.lineWrapping],
  });
  const unbind = bindText(view, doc, ["content"]);
  dir.signal.addEventListener("abort", () => {
    unbind();
    view.destroy();
    host.remove();
  });
}

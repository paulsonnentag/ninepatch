/** §4. A CodeMirror editor on `selectedDoc` — a link derived from the
 * route. A retarget doesn't re-run anything here: the namespace is the
 * same, it just fires with the new document's content, and `bindText`
 * pulls it in. No framework at all: two opens, one editor, one binding. */

import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import type { Namespace } from "@ninepatch/core";
import { bindText } from "@ninepatch/codemirror";
import type { MarkdownDoc } from "../types";

export async function Markdown(ns: Namespace) {
  const dom = await ns.open<Element>("dom");
  const doc = await ns.open<MarkdownDoc>("selectedDoc"); // follows the link, and keeps following

  const host = dom.value.appendChild(document.createElement("div"));
  host.className = "editor";
  const view = new EditorView({
    parent: host,
    extensions: [basicSetup, markdown()],
  });
  const unbind = bindText(view, doc, ["content"]);
  ns.signal.addEventListener("abort", () => {
    unbind();
    view.destroy();
    host.remove();
  });
}

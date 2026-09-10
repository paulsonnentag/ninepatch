/** §4. A CodeMirror editor on `selectedDoc` — a link derived from the
 * route. A retarget doesn't re-run anything here: the namespace is the
 * same, it just fires `change` with the new document's content, and
 * `bindText` pulls it in. */

import { createEffect, onCleanup } from "solid-js"
import { EditorView } from "@codemirror/view"
import { basicSetup } from "codemirror"
import { markdown } from "@codemirror/lang-markdown"
import { createOpen, tool } from "@ninepatch/solid"
import { bindText } from "@ninepatch/codemirror"
import type { MarkdownDoc } from "../types"

export const Markdown = tool(() => {
  const doc = createOpen<MarkdownDoc>("selectedDoc") // follows the link, and keeps following

  const host = (<div class="editor" />) as HTMLDivElement
  const view = new EditorView({ parent: host, extensions: [basicSetup, markdown()] })
  createEffect(() => {
    const d = doc()
    if (d) onCleanup(bindText(view, d, ["content"]))
  })
  onCleanup(() => view.destroy())
  return host
})

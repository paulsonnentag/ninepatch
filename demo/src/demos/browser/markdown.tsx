import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { minimalSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import type { Directory } from "@ninepatch/core";
import { bindText } from "@ninepatch/codemirror";
import type { MarkdownDoc } from "../../types";

export default async function Markdown(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<MarkdownDoc>("document"); // follows the link, and keeps following
  const selected = await dir.open<string>("document"); // the same name for rebinding: navigation

  const host = dom.value.appendChild(document.createElement("div"));
  host.className = "editor";
  const view = new EditorView({
    parent: host,
    extensions: [
      minimalSetup, // no line numbers
      markdown(),
      EditorView.lineWrapping,
      docLinks((path) => selected.set(path.slice(1))), // set rebinds the link
    ],
  });
  const unbind = bindText(view, doc, ["content"]);
  dir.signal.addEventListener("abort", () => {
    unbind();
    view.destroy();
    host.remove();
  });
}

const LINK = /\[([^\]]*)\]\((\/automerge:[A-Za-z0-9]+)\)/g;

/** The little link plugin: a markdown link to `/automerge:…` renders as
 * its underlined text; put the cursor inside and the raw source shows.
 * Clicking one navigates — the same rebind the bar causes. */
function docLinks(go: (path: string) => void) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = linkDecorations(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet)
          this.decorations = linkDecorations(update.view);
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      eventHandlers: {
        mousedown(event) {
          const link = (event.target as HTMLElement).closest(".cm-doclink");
          if (!link) return false;
          go(link.getAttribute("data-path")!);
          event.preventDefault();
          return true;
        },
      },
    }
  );
}

function linkDecorations(view: EditorView): DecorationSet {
  const decorations = [];
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    for (const match of text.matchAll(LINK)) {
      const start = from + match.index;
      const end = start + match[0].length;
      const inside = view.state.selection.ranges.some(
        (range) => range.head > start && range.head < end
      );
      if (inside) continue; // cursor in the link: show the source
      decorations.push(
        Decoration.replace({
          widget: new LinkWidget(match[1], match[2]),
        }).range(start, end)
      );
    }
  }
  return Decoration.set(decorations);
}

class LinkWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly path: string
  ) {
    super();
  }
  override eq(other: LinkWidget) {
    return other.label === this.label && other.path === this.path;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-doclink";
    el.setAttribute("data-path", this.path);
    el.textContent = this.label;
    return el;
  }
  override ignoreEvent() {
    return false; // let the editor's handlers see clicks on the widget
  }
}

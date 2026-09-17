import { createSignal, onCleanup, type Accessor } from "solid-js";
import type { Directory } from "@ninepatch/core";
import { moduleUrl } from "../../boot";
import type { MarkdownDoc } from "../../types";

// what shows a document, by its type
const VIEWS: Record<string, string> = {
  markdown: moduleUrl("frame/markdown.tsx"),
};

/** A note by URL, live; `undefined` until it arrives, `null` if it never does. */
export function watchNote(
  dir: Directory,
  url: string
): Accessor<MarkdownDoc | null | undefined> {
  const [note, setNote] = createSignal<MarkdownDoc | null>();
  let opened: Directory | undefined;
  let closed = false;
  dir.open<MarkdownDoc>(url).then(
    (d) => {
      if (closed) return d.close();
      opened = d;
      d.subscribe((doc) => setNote(doc));
    },
    () => setNote(null)
  );
  onCleanup(() => {
    closed = true;
    opened?.close();
  });
  return note;
}

/** A note's title — its first non-empty line, minus the `#` — by URL, live. */
export function watchTitle(dir: Directory, url: string): Accessor<string> {
  const note = watchNote(dir, url);
  return () => {
    const doc = note();
    return doc === undefined ? "…" : doc === null ? "(missing)" : titleOf(doc);
  };
}

export function titleOf(doc: MarkdownDoc): string {
  const line = doc.content.split("\n").find((l) => l.trim());
  return line?.replace(/^#+\s*/, "") || "Untitled";
}

export function viewOf(doc: { type?: string }): string {
  return VIEWS[doc.type ?? "markdown"];
}

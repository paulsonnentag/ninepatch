import type { AnyDocumentId } from "@automerge/automerge-repo";
import { repo } from "../../boot";
import type { LayoutDoc, LayoutWindow } from "../../types";

const KEY = "ninepatch:demo:views:layout";

/** The layout document's URL: the one from last time, or a fresh one. */
export function findOrCreateLayout(docUrl: string): string {
  const found = localStorage.getItem(KEY);
  if (found) return found;
  const layout = repo.create<LayoutDoc>({ windows: seedLayoutWindows(docUrl) });
  localStorage.setItem(KEY, layout.url);
  return layout.url;
}

/** The seeded windows again, into the same document. */
export async function resetLayout(url: string, docUrl: string): Promise<void> {
  const layout = await repo.find<LayoutDoc>(url as AnyDocumentId);
  const windows = seedLayoutWindows(docUrl);
  layout.change((d) => {
    for (const id of Object.keys(d.windows)) delete d.windows[id];
    Object.assign(d.windows, windows);
  });
}

// an arrangement over one document: the editor and the count take the
// workspace's `document`, the preview is pinned to `docUrl` wherever the
// layout is used
export function seedLayoutWindows(
  docUrl: string
): Record<string, LayoutWindow> {
  return {
    editor: {
      componentUrl: "./demos/views/editor.tsx",
      x: 16,
      y: 16,
      w: 300,
      h: 180,
      docUrl,
      current: true,
    },
    count: {
      componentUrl: "./demos/views/wordcount.tsx",
      x: 16,
      y: 212,
      w: 130,
      h: 110,
      docUrl,
      current: true,
    },
    preview: {
      componentUrl: "./demos/views/preview.tsx",
      x: 162,
      y: 212,
      w: 220,
      h: 200,
      docUrl,
    },
  };
}

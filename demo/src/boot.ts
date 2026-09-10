import { Repo, type AnyDocumentId } from "@automerge/automerge-repo";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import { BroadcastChannelNetworkAdapter } from "@automerge/automerge-repo-network-broadcastchannel";
import { createDirectory, field, fromDoc, type Main } from "@ninepatch/core";
import type {
  CanvasDoc,
  ChatDoc,
  ContactDoc,
  Folder,
  MarkdownDoc,
  Seed,
} from "./types";

export const repo = new Repo({
  storage: new IndexedDBStorageAdapter("ninepatch-demo"),
  network: [new BroadcastChannelNetworkAdapter()],
});

export const seed = await findOrCreateSeed();

// The tools, each its own module — spawn takes the URL, the root's
// importer resolves it, and Vite serves every tool as its own chunk.
const modules = import.meta.glob<{ default: Main }>("./tools/*.{ts,tsx}");

/** The URL a tool is spawned by. */
export function moduleUrl(name: string): string {
  return `./tools/${name}`;
}

const root = createDirectory({
  import: (url) =>
    (modules[url] ?? (() => import(/* @vite-ignore */ url)))() as Promise<{
      default: Main;
    }>,
});

/** The process table — the root's alone. The page keeps the root here and
 * hands out `frame`; only the harness's data panel reads this. */
export const processes = root.processes;

// The repo, as a server — verbatim from the spec. Filters by protocol,
// walks into documents itself, mounts every asked-for field as a live
// handle. Nothing in the directory knows what a document is.
root.serve({
  async open(target, from) {
    const [url, ...fields] = target;
    if (!url.startsWith("automerge:")) return;
    if (fields.length === 0) {
      from.mount(url, fromDoc(await repo.find(url as AnyDocumentId)));
      return;
    }
    const doc = await from.open<Record<string, unknown>>(url); // a miss the first time: this same handler fills it
    from.mount(target, field(doc, fields)); // doc is a handle; it closes with the requester
  },
  close(target, from) {
    if (target[0].startsWith("automerge:")) from.unmount(target);
  },
});

root.mount("demo", seed.url); // a link; demo/chat walks the folder and follows again

export const frame = root.fork("page"); // the page renders under this

async function findOrCreateSeed(): Promise<Seed> {
  const KEY = "ninepatch:demo:folder";
  let url = localStorage.getItem(KEY);
  if (!url) {
    const alice = repo.create<ContactDoc>({ name: "Alice", color: "#e11d48" });
    const bob = repo.create<ContactDoc>({ name: "Bob", color: "#2563eb" });
    const chat = repo.create<ChatDoc>({ messages: [] });
    const canvas = repo.create<CanvasDoc>({
      cards: {
        berlin: { x: 30, y: 24, title: "Berlin", lat: 52.5, lng: 13.4 },
        tokyo: { x: 250, y: 90, title: "Tokyo", lat: 35.7, lng: 139.7 },
        somewhere: { x: 120, y: 190, title: "Somewhere" },
      },
    });
    const notes = repo.create<MarkdownDoc>({
      content:
        "# Notes\n\nType here. Open the page in a second tab and type there too.\n",
    });
    const notes2 = repo.create<MarkdownDoc>({
      content:
        "# The second document\n\nSwitch back and forth with the buttons or the bar.\n",
    });
    const folder = repo.create<Folder>({
      chat: chat.url,
      canvas: canvas.url,
      notes: notes.url,
      notes2: notes2.url,
      alice: alice.url,
      bob: bob.url,
    });
    localStorage.setItem(KEY, folder.url);
    url = folder.url;
  }
  const folder = await repo.find<Folder>(url as AnyDocumentId);
  const docs = folder.doc();
  return {
    url,
    chat: docs.chat,
    canvas: docs.canvas,
    notes: docs.notes,
    notes2: docs.notes2,
    alice: docs.alice,
    bob: docs.bob,
  };
}

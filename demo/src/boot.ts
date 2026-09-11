import { Repo, type AnyDocumentId } from "@automerge/automerge-repo";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import { BroadcastChannelNetworkAdapter } from "@automerge/automerge-repo-network-broadcastchannel";
import { createDirectory, field, fromDoc, type Main } from "@ninepatch/core";
import type {
  CanvasDoc,
  CanvasItem,
  ChatDoc,
  ContactDoc,
  Folder,
  MarkdownDoc,
  PlaceDoc,
  Seed,
  TodoDoc,
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

// Mount functions registered under synthetic urls, so a plain function
// can be spawned like any module — `createComponent` uses this.
const registered = new Map<string, { default: Main }>();

export function registerTool(name: string, main: Main): string {
  const url = `tool:${name}`;
  registered.set(url, { default: main });
  return url;
}

const root = createDirectory({
  import: async (url) =>
    registered.get(url) ??
    ((modules[url] ?? (() => import(/* @vite-ignore */ url)))() as Promise<{
      default: Main;
    }>),
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
    // Every place is its own document; the canvas doc only stores which
    // component renders each item, which document it edits, and where.
    const canvas = repo.create<CanvasDoc>({
      items: {
        berlin: placeItem(
          repo.create<PlaceDoc>({ title: "Berlin", lat: 52.5, lng: 13.4 }).url,
          24,
          20
        ),
        tokyo: placeItem(
          repo.create<PlaceDoc>({ title: "Tokyo", lat: 35.7, lng: 139.7 }).url,
          56,
          130
        ),
        somewhere: placeItem(
          repo.create<PlaceDoc>({ title: "Somewhere" }).url,
          96,
          240
        ),
        map: { componentUrl: "./tools/map.tsx", x: 210, y: 16 },
      },
    });
    const notes2 = repo.create<MarkdownDoc>({ content: "" });
    const notes = repo.create<MarkdownDoc>({
      content: `# Notes\n\nType here. Open the page in a second tab and type there too.\n\nMore in [the second document](/${notes2.url}).\n`,
    });
    notes2.change((d) => {
      d.content = `# The second document\n\nSwitch back and forth with the bar or the link back to [notes](/${notes.url}).\n`;
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
  if (!folder.doc().todos) {
    // seeded before the todos section existed
    const todos = repo.create<TodoDoc>({
      items: [{ text: "open this page in a second tab", done: false }],
    });
    folder.change((d) => (d.todos = todos.url));
  }
  const docs = folder.doc();
  type LegacyCanvas = CanvasDoc & {
    cards?: Record<
      string,
      { x: number; y: number; title: string; lat?: number; lng?: number }
    >;
  };
  const canvas = await repo.find<LegacyCanvas>(docs.canvas as AnyDocumentId);
  if (!canvas.doc().items) {
    // seeded before items carried componentUrl/docUrl: each card becomes
    // its own document, the canvas keeps only the wiring
    const items: Record<string, CanvasItem> = {
      map: { componentUrl: "./tools/map.tsx", x: 210, y: 16 },
    };
    for (const [id, card] of Object.entries(canvas.doc().cards ?? {})) {
      const doc =
        card.lat !== undefined && card.lng !== undefined
          ? repo.create<PlaceDoc>({
              title: card.title,
              lat: card.lat,
              lng: card.lng,
            })
          : repo.create<PlaceDoc>({ title: card.title });
      items[id] = placeItem(doc.url, card.x, card.y);
    }
    canvas.change((d) => {
      d.items = items;
      delete d.cards;
    });
  }
  const notes = await repo.find<MarkdownDoc>(docs.notes as AnyDocumentId);
  if (!notes.doc().content.includes("/automerge:")) {
    // seeded before the notes linked to each other
    const notes2 = await repo.find<MarkdownDoc>(docs.notes2 as AnyDocumentId);
    notes.change((d) => {
      d.content += `\nMore in [the second document](/${docs.notes2}).\n`;
    });
    notes2.change((d) => {
      d.content += `\nBack to [notes](/${docs.notes}).\n`;
    });
  }
  return {
    url,
    todos: docs.todos,
    chat: docs.chat,
    canvas: docs.canvas,
    notes: docs.notes,
    notes2: docs.notes2,
    alice: docs.alice,
    bob: docs.bob,
  };
}

function placeItem(docUrl: string, x: number, y: number): CanvasItem {
  return { componentUrl: "./tools/place.tsx", docUrl, x, y };
}

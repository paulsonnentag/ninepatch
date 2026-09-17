import { Repo, type AnyDocumentId } from "@automerge/automerge-repo";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import { BroadcastChannelNetworkAdapter } from "@automerge/automerge-repo-network-broadcastchannel";
import { createDirectory, fromDoc, type Main } from "@ninepatch/core";
import type {
  CanvasDoc,
  CanvasItem,
  ChatDoc,
  ContactDoc,
  Folder,
  LikesDoc,
  EraserShape,
  MapDoc,
  MapShape,
  MarkdownDoc,
  PlaceDoc,
  Seed,
  Shape,
  Stroke,
  SurfaceDoc,
  TodoDoc,
} from "./types";

export const repo = new Repo({
  storage: new IndexedDBStorageAdapter("ninepatch-demo"),
  network: [new BroadcastChannelNetworkAdapter()],
});

export const seed = await findOrCreateSeed();

// The tools, each its own module in its demo's folder — spawn takes the
// URL, the root's importer resolves it, and Vite serves every tool as its
// own chunk.
const modules = import.meta.glob<{ default: Main }>([
  "./demos/*/*.{ts,tsx}",
  "!./demos/*/index.tsx", // the demos' wiring, not tools
]);

/** The URL a tool is spawned by, from its path inside `demos/`. */
export function moduleUrl(path: string): string {
  return `./demos/${path}`;
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

// the root's process table; only the harness's data panel reads this
export const processes = root.processes;

// The repo, as a server — verbatim from the spec. Answers whole documents;
// the directory walks into them by key. Nothing here knows what a field is.
root.serve({
  async open([url, ...fields], from) {
    if (!url.startsWith("automerge:") || fields.length > 0) return;
    from.mount(url, fromDoc(await repo.find(url as AnyDocumentId)));
  },
  close([url, ...fields], from) {
    if (url.startsWith("automerge:") && fields.length === 0) from.unmount(url);
  },
});

export const frame = root.fork("page"); // the page renders under this

async function findOrCreateSeed(): Promise<Seed> {
  const KEY = "ninepatch:demo:folder";
  let url = localStorage.getItem(KEY);
  if (!url) {
    const alice = repo.create<ContactDoc>({ name: "Alice", color: "#e11d48" });
    const bob = repo.create<ContactDoc>({ name: "Bob", color: "#2563eb" });
    const chat = repo.create<ChatDoc>({ messages: seedChatMessages() });
    // Every place is its own document; the canvas doc only stores which
    // component renders each item, which document it edits, and where.
    const canvas = repo.create<CanvasDoc>({ items: seedCanvasItems() });
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
    const todos = repo.create<TodoDoc>({ items: seedTodoItems() });
    folder.change((d) => (d.todos = todos.url));
  }
  if (!folder.doc().whiteboard) {
    // seeded before the whiteboard section existed
    const whiteboard = repo.create<SurfaceDoc>({
      shapes: seedWhiteboardShapes(),
    });
    folder.change((d) => (d.whiteboard = whiteboard.url));
  }
  if (!folder.doc().likes) {
    // seeded before the feeds section existed
    const likes = repo.create<LikesDoc>({ items: {} });
    folder.change((d) => (d.likes = likes.url));
  }
  const docs = folder.doc();
  const whiteboard = await repo.find<SurfaceDoc>(
    docs.whiteboard as AnyDocumentId
  );
  if (
    !Object.values(whiteboard.doc().shapes).some((shape) =>
      shape.componentUrl.endsWith("/pen.tsx")
    )
  ) {
    // seeded when a nested surface was a document of its own, or before
    // the tools were shapes
    const shapes = seedWhiteboardShapes();
    whiteboard.change((d) => {
      for (const id of Object.keys(d.shapes)) delete d.shapes[id];
      Object.assign(d.shapes, shapes);
    });
  }
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
    const items: Record<string, CanvasItem> = { map: mapItem(210, 16) };
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
  const items = Object.values(canvas.doc().items);
  if (items.some((it) => it.componentUrl.startsWith("./tools/"))) {
    // seeded before each demo had its own folder
    canvas.change((d) => {
      for (const it of Object.values(d.items))
        it.componentUrl = it.componentUrl.replace(
          "./tools/",
          "./demos/canvas/"
        );
    });
  }
  if (items.some((it) => !it.docUrl)) {
    // seeded before the map had a document of its own to be selected by
    canvas.change((d) => {
      for (const it of Object.values(d.items))
        if (!it.docUrl) it.docUrl = repo.create<MapDoc>(mapDoc()).url;
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
    whiteboard: docs.whiteboard,
    notes: docs.notes,
    notes2: docs.notes2,
    alice: docs.alice,
    bob: docs.bob,
    likes: docs.likes,
  };
}

// Every place is its own document; the canvas doc only stores which
// component renders each item, which document it edits, and where.
// The canvas demo's reset builds the same set.
export function seedTodoItems(): TodoDoc["items"] {
  return [
    { text: "buy groceries", done: false },
    { text: "water the plants", done: false },
    { text: "call the dentist", done: false },
    { text: "take out the trash", done: true },
  ];
}

export function seedChatMessages(): ChatDoc["messages"] {
  const at = Date.now();
  return [
    {
      author: "Alice",
      color: "#e11d48",
      text: "Did you pick up the groceries?",
      at,
    },
    { author: "Bob", color: "#2563eb", text: "Yep, just got back.", at },
    { author: "Alice", color: "#e11d48", text: "Great, thanks!", at },
  ];
}

export function seedCanvasItems(): Record<string, CanvasItem> {
  return {
    berlin: placeItem(
      repo.create<PlaceDoc>({
        title: "Berlin",
        lat: 52.5,
        lng: 13.4,
        color: "#e11d48",
      }).url,
      24,
      20
    ),
    tokyo: placeItem(
      repo.create<PlaceDoc>({
        title: "Tokyo",
        lat: 35.7,
        lng: 139.7,
        color: "#2563eb",
      }).url,
      56,
      130
    ),
    somewhere: placeItem(
      repo.create<PlaceDoc>({ title: "Somewhere" }).url,
      96,
      240
    ),
    map: mapItem(210, 16),
  };
}

function placeItem(docUrl: string, x: number, y: number): CanvasItem {
  return { componentUrl: "./demos/canvas/place.tsx", docUrl, x, y };
}

// the map keeps its view in a document of its own, so it is an item like
// any other: selectable by URL
function mapItem(x: number, y: number): CanvasItem {
  return {
    componentUrl: "./demos/canvas/map.tsx",
    docUrl: repo.create<MapDoc>(mapDoc()).url,
    x,
    y,
  };
}

function mapDoc(): MapDoc {
  return { center: { lng: 13.388, lat: 52.517 }, zoom: 9.5 };
}

// The whiteboard is a canvas whose shapes include its own tools — pens and
// an eraser are buttons — and the map, a second surface inline, drawn on
// in map units.
export function seedWhiteboardShapes(): Record<string, Shape> {
  const pen = (y: number, color: string, width: number): Stroke => ({
    componentUrl: "./demos/whiteboard/pen.tsx",
    x: 14,
    y,
    outline: rect(28, 28),
    color,
    width,
  });
  const eraser: EraserShape = {
    componentUrl: "./demos/whiteboard/eraser.tsx",
    x: 14,
    y: 122,
    outline: rect(28, 28),
    width: 12,
  };
  const map: MapShape = {
    componentUrl: "./demos/whiteboard/map.tsx",
    x: 60,
    y: 20,
    outline: rect(320, 380),
    origin: { lng: 13.388, lat: 52.517, zoom: 11 },
    shapes: {},
  };
  return {
    black: pen(14, "#111827", 3),
    red: pen(50, "#e11d48", 4),
    blue: pen(86, "#2563eb", 8),
    eraser,
    map,
  };
}

function rect(w: number, h: number): number[] {
  return [0, 0, w, 0, w, h, 0, h];
}

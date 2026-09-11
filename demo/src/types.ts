export type TodoDoc = { items: { text: string; done: boolean }[] };
export type ContactDoc = { name: string; color: string };
export type ChatDoc = {
  messages: { author: string; color: string; text: string; at: number }[];
};
/** An item on the canvas: which module renders it, which document it
 * edits, and where it sits. The canvas knows nothing else. */
export type CanvasItem = {
  componentUrl: string;
  docUrl?: string; // mounted into the item's fork as `document`
  x: number;
  y: number;
};
export type CanvasDoc = { items: Record<string, CanvasItem> };
export type PlaceDoc = { title: string; lat?: number; lng?: number };
export type Place = { id: string; title: string; lat: number; lng: number };
export type MarkdownDoc = { content: string };
export type Folder = Record<string, string>;

export type Seed = {
  url: string;
  todos: string;
  chat: string;
  canvas: string;
  notes: string;
  notes2: string;
  alice: string;
  bob: string;
};

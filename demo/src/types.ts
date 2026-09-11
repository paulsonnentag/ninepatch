export type TodoDoc = { items: { text: string; done: boolean }[] };
export type ContactDoc = { name: string; color: string };
export type ChatDoc = {
  messages: { author: string; color: string; text: string; at: number }[];
};
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

export type Cell = {
  ch: string;
  fg?: string;
  bg?: string;
  bold?: boolean;
  inverse?: boolean;
};
export type Size = { cols: number; rows: number };
export type Screen = Size & {
  cells: Cell[]; // row-major, cols * rows of them
  cursor: { row: number; col: number } | null;
};
export type Keyboard = {
  pressedKey: string | null; // KeyboardEvent.key of the last press
  isPressed: boolean; // true from keydown until it is released
  seq: number; // counts presses, so holding a key repeats as new events
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
};

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

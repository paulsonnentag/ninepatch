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
export type PlaceDoc = {
  title: string;
  lat?: number;
  lng?: number;
  color?: string;
};
export type MapDoc = { center: { lng: number; lat: number }; zoom: number };
// what the schemas walker sorts documents into, keyed by document URL
export type Location = { title: string; lat: number; lng: number };
export type Color = { color: string };
export type MarkdownDoc = { type?: "markdown"; content: string };
export type Folder = Record<string, string>;

// A window on the layout: which tool, where, and which document. With
// `current` set the window mounts nothing of its own, so its `document`
// is whatever the host of the layout has there.
export type LayoutWindow = {
  componentUrl: string;
  x: number;
  y: number;
  w: number;
  h: number;
  docUrl: string;
  current?: boolean;
};
export type LayoutDoc = { windows: Record<string, LayoutWindow> };

// the frame: the documents the sidebar lists, and the view state shared by
// the sidebar and whichever window manager is running
export type DocumentsDoc = { type: "documents"; documents: string[] };
export type Selection = {
  document: string; // an empty one is nothing
  view: string; // the componentUrl to show it with
  target?: string; // a surface to open it in, by name
};
export type Surfaces = Record<string, string[]>; // by name, the documents on each; an empty one is a place the manager could make
export type Workspace = {
  selected: Selection;
  open: string[]; // documents with a window
  surfaces: Surfaces; // written by the current manager, in its own words
};

// An RSS feed as the feeds server mounts it: read-only, refetched on a
// timer. Items are keyed by a slug of their link so each is a plain name.
export type FeedItem = {
  guid: string;
  title: string;
  link: string;
  pubDate: string;
  description: string;
};
export type FeedDoc = {
  url: string; // where the feed was fetched from
  title: string;
  link: string; // the site
  items: Record<string, FeedItem>;
};
// A like is about the thing, not the feed it was seen in: keyed by link,
// with enough copied over to read as a list once the feed has moved on.
export type Like = {
  title: string;
  link: string;
  feed: string; // the feed URL it was liked from
  at: number;
};
export type LikesDoc = { items: Record<string, Like> };

// A surface holds shapes; every shape is a component placed at x/y with an
// outline of points relative to that position, in the surface's own units.
// A shape is its component's document, so a shape that is itself a surface
// carries its own `shapes` inline.
export type Shape = {
  componentUrl: string;
  x: number;
  y: number;
  outline: number[]; // flat [x0, y0, x1, y1, ...]
};
export type Stroke = Shape & { color: string; width: number }; // a line; also what a pen is
export type EraserShape = Shape & { width: number };
export type SurfaceDoc = { shapes: Record<string, Shape> };
export type MapShape = Shape &
  SurfaceDoc & {
    origin: { lng: number; lat: number; zoom: number }; // local units: pixels at this zoom, from this point
  };
export type LocalPointer = { x: number; y: number; down: boolean } | null; // in the units of whoever mounted it
// the map's pointer: map units, and where on earth that is
export type MapPointer =
  (NonNullable<LocalPointer> & { lng: number; lat: number }) | null;
// what a surface is, to the shapes on it and the tools above: its record's
// shapes, and on the record the pointer in its units and how many screen
// pixels one of those units is
export type Surface = { pointer: LocalPointer; scale: number };
// the selected shape, whole — one for the board; a pen is selected when
// this is its record, and does the drawing itself
export type Selected = Shape | null;

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
  whiteboard: string;
  notes: string;
  notes2: string;
  recipe: string;
  letter: string;
  layout: string;
  alice: string;
  bob: string;
  likes: string;
};

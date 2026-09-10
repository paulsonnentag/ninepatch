export type TodoDoc = { items: { text: string; done: boolean }[] };
export type ContactDoc = { name: string; color: string };
export type ChatDoc = {
  messages: { author: string; color: string; text: string; at: number }[];
};
export type Card = {
  x: number;
  y: number;
  title: string;
  lat?: number;
  lng?: number;
};
export type CanvasDoc = { cards: Record<string, Card> };
export type Place = { id: string; title: string; lat: number; lng: number };
export type MarkdownDoc = { content: string };
export type Route = { docUrl: string };
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

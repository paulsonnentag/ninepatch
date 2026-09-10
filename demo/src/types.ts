import type { Directory } from "@ninepatch/core";

/** A tool is a function of one directory. Everything it needs — the DOM
 * included — is an entry; there is nothing to return, and cleanup hangs
 * off `dir.signal`. */
export type Tool = (dir: Directory) => Promise<void>;

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
  chat: string;
  canvas: string;
  notes: string;
  notes2: string;
  alice: string;
  bob: string;
};

import type { DocHandle } from "@automerge/automerge-repo"

export type ContactDoc = { name: string; color: string }
export type AccountDoc = { contact: string }
export type ChatDoc = { messages: { author: string; color: string; text: string; at: number }[] }
export type Card = { x: number; y: number; title: string; lat?: number; lng?: number }
export type CanvasDoc = { cards: Record<string, Card> }
export type Place = { id: string; title: string; lat: number; lng: number }
export type MarkdownDoc = { content: string }
export type Route = { docUrl: string }
export type Folder = Record<string, string>

export type Seed = {
  url: string
  chat: string
  canvas: string
  notes: string
  notes2: string
  alice: string
  bob: string
  account: string
}

declare global {
  // The old world's way in: one account per page, hung on the window.
  interface Window {
    accountDoc: DocHandle<AccountDoc>
  }
}

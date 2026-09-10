/** Resolution: `locate` is the structural lookup across the chain of
 * overlays a namespace falls through to; `walk` runs it and follows
 * links — a handle whose value is a URL string — restarting from the
 * requester each hop, with a hop limit. */

import type { Handle } from "./handle"
import type { Overlay } from "./overlay"
import { hasScheme, isUrlRooted, parsePath, startsWith } from "./path"

/** What walk needs of a namespace: its overlay, its chain, its absolute
 * position (origin-rooted names, or URL-rooted once any hop went through
 * a URL). */
export type ChainNode = {
  overlay: Overlay
  parent: ChainNode | undefined
  pos: string[]
}

export type WalkResult =
  | { kind: "found"; at: string[]; handle: Handle<unknown> | undefined; crossed: Handle<unknown>[] }
  | { kind: "miss"; at: string[]; crossed: Handle<unknown>[] }

const HOP_LIMIT = 32

export function walk(start: ChainNode, abs: string[]): WalkResult {
  const crossed: Handle<unknown>[] = []
  let cur = abs
  for (let hops = 0; hops <= HOP_LIMIT; hops++) {
    const found = locate(start, cur)
    if (found.handle) {
      const link = linkTarget(found.handle)
      if (link) {
        crossed.push(found.handle)
        cur = link
        continue
      }
      return { kind: "found", at: cur, handle: found.handle, crossed }
    }
    if (found.hasEntries) return { kind: "found", at: cur, handle: undefined, crossed }
    // Structure ran out. Follow a link at the longest prefix that has one.
    let followed = false
    for (let j = cur.length - 1; j >= 1; j--) {
      const prefix = locate(start, cur.slice(0, j))
      if (prefix.handle) {
        const link = linkTarget(prefix.handle)
        if (link) {
          crossed.push(prefix.handle)
          cur = [...link, ...cur.slice(j)]
          followed = true
        }
        break
      }
      if (prefix.hasEntries) break
    }
    if (!followed) return { kind: "miss", at: cur, crossed }
  }
  throw new Error(`link loop at ${cur.join("/")}`)
}

export function locate(start: ChainNode, abs: string[]): { handle: Handle<unknown> | undefined; hasEntries: boolean } {
  let hasEntries = false
  for (let ns: ChainNode | undefined = start; ns; ns = ns.parent) {
    const local = toLocal(abs, ns)
    if (local) {
      const found = ns.overlay.lookup(local)
      if (found.handle) return { handle: found.handle, hasEntries: hasEntries || found.hasEntries }
      hasEntries ||= found.hasEntries
      if (found.cutBlocked) break
    }
  }
  return { handle: undefined, hasEntries }
}

function toLocal(abs: string[], ns: ChainNode): string[] | undefined {
  if (isUrlRooted(abs)) return abs
  if (isUrlRooted(ns.pos)) return undefined
  return startsWith(abs, ns.pos) ? abs.slice(ns.pos.length) : undefined
}

function linkTarget(handle: Handle<unknown>): string[] | undefined {
  let value: unknown
  try {
    value = handle.value
  } catch {
    return undefined
  }
  if (typeof value !== "string" || !hasScheme(value)) return undefined
  try {
    const names = parsePath(value)
    return isUrlRooted(names) ? names : undefined
  } catch {
    return undefined
  }
}

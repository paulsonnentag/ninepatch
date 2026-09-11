// resolution, as the spec states it: locate structurally, follow links
// (restarting from the requester each hop), never hold an absolute path

import type { Handle } from "./handle";
import type { Overlay } from "./overlay";
import { hasScheme, isUrlRooted, parsePath } from "./path";

// what walk needs of a directory: entries, parent, and the path opened at
export type ChainNode = {
  overlay: Overlay;
  parent: ChainNode | undefined;
  path: string[];
};

// `at` is in the requester's coordinates — URL-rooted once a link was crossed
export type WalkResult =
  | {
      kind: "found";
      at: string[];
      handle: Handle<unknown> | undefined;
      crossed: Handle<unknown>[];
    }
  | { kind: "miss"; at: string[]; crossed: Handle<unknown>[] };

const HOP_LIMIT = 32;

export function walk(
  start: ChainNode,
  rel: string[],
  options: { followLast?: boolean } = {}
): WalkResult {
  const crossed: Handle<unknown>[] = [];
  let cur = rel;
  for (let hops = 0; hops <= HOP_LIMIT; hops++) {
    const found = locate(start, cur);
    if (found.handle) {
      // A link found here sits at the end of the path — `followLast:
      // false` stops on the link entry itself instead of crossing it,
      // which is how `set` rebinds a link rather than write through it.
      const link =
        options.followLast === false ? undefined : linkTarget(found.handle);
      if (link) {
        crossed.push(found.handle);
        cur = link;
        continue;
      }
      return { kind: "found", at: cur, handle: found.handle, crossed };
    }
    if (found.hasEntries)
      return { kind: "found", at: cur, handle: undefined, crossed };
    // Structure ran out. Follow a link at the longest prefix that has one.
    const hop = followableLink(start, cur, crossed);
    if (!hop) return { kind: "miss", at: cur, crossed };
    cur = hop;
  }
  throw new Error(`link loop at ${cur.join("/")}`);
}

// own entries at `rel`; a cut stops the climb; else the parent gets `path + rel`
export function locate(
  start: ChainNode,
  rel: string[]
): { handle: Handle<unknown> | undefined; hasEntries: boolean } {
  let hasEntries = false;
  let cur = rel;
  for (let dir: ChainNode | undefined = start; dir; dir = dir.parent) {
    const found = dir.overlay.lookup(cur);
    if (found.handle)
      return {
        handle: found.handle,
        hasEntries: hasEntries || found.hasEntries,
      };
    hasEntries ||= found.hasEntries;
    if (found.cutBlocked) break;
    cur = isUrlRooted(cur) ? cur : [...dir.path, ...cur];
  }
  return { handle: undefined, hasEntries };
}

// the longest prefix holding a link, searched here then climbing; the first
// position holding anything decides — a non-link blocks the search
function followableLink(
  start: ChainNode,
  cur: string[],
  crossed: Handle<unknown>[]
): string[] | undefined {
  let dir: ChainNode | undefined = start;
  let p = cur;
  let top = p.length - 1;
  while (dir) {
    for (let j = top; j >= (isUrlRooted(p) ? 1 : 0); j--) {
      const prefix = locate(dir, p.slice(0, j));
      if (prefix.handle) {
        const link = linkTarget(prefix.handle);
        if (!link) return undefined;
        crossed.push(prefix.handle);
        return [...link, ...p.slice(j)];
      }
      if (prefix.hasEntries) return undefined;
    }
    if (isUrlRooted(p)) return undefined;
    top = dir.path.length - 1;
    p = [...dir.path, ...p];
    dir = dir.parent;
  }
  return undefined;
}

function linkTarget(handle: Handle<unknown>): string[] | undefined {
  let value: unknown;
  try {
    value = handle.value;
  } catch {
    return undefined;
  }
  if (typeof value !== "string" || !hasScheme(value)) return undefined;
  try {
    const names = parsePath(value);
    return isUrlRooted(names) ? names : undefined;
  } catch {
    return undefined;
  }
}

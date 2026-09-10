/** Resolution, as the spec's Resolution section states it: a directory is
 * its own entries, the directory it came from, and the path it was opened
 * at there. `locate` is the structural lookup — own entries first, then
 * the parent asked for `path + rel` — and `walk` runs it and follows
 * links — a handle whose value is a URL string — restarting from the
 * requester each hop, with a hop limit. Nothing here holds an absolute
 * path. */

import type { Handle } from "./handle";
import type { Overlay } from "./overlay";
import { hasScheme, isUrlRooted, parsePath } from "./path";

/** What walk needs of a directory: its entries, the directory it came
 * from, and the path it was opened at there — `[]` for a fork. */
export type ChainNode = {
  overlay: Overlay;
  parent: ChainNode | undefined;
  path: string[];
};

/** `at` is in the requester's coordinates — or URL-rooted, once a link
 * was followed; a URL reads the same at every level. */
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

/** The structural lookup: own entries at `rel`; a cut stops the climb;
 * otherwise the parent is asked for `path + rel`. URL-rooted paths climb
 * unchanged — a URL reads the same at every level. */
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

/** The longest prefix of the path that holds a link, walked outward: the
 * prefixes of `cur` here first (down to the requester's own node), then,
 * climbing, the positions the path grows through inside each ancestor.
 * The first position holding anything decides: a link is followed — the
 * remainder appended to its URL — and a plain value or entries block the
 * search. Once the path is URL-rooted there is nothing new above. */
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

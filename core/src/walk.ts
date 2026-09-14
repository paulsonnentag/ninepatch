// resolution, as the spec states it: locate structurally, follow links
// (restarting from the requester each hop), enter binds (continuing
// inside the mounted directory), never hold an absolute path

import type { Handle } from "./handle";
import { Overlay } from "./overlay";
import { hasScheme, isUrlRooted, parsePath } from "./path";

// what walk needs of a directory: entries, parent, path opened at, liveness
export type ChainNode = {
  overlay: Overlay;
  parent: ChainNode | undefined;
  path: string[];
  closed: boolean;
};

// the last bind crossed and what remains of the path inside it
export type Bound = { dir: ChainNode; rest: string[] };

// `at` is in the requester's coordinates — URL-rooted once a link was
// crossed, untouched by binds; `entered` is every bind crossed, in order
export type WalkResult =
  | {
      kind: "found";
      at: string[];
      handle: Handle<unknown> | undefined;
      crossed: Handle<unknown>[];
      entered: ChainNode[];
      bound: Bound | undefined;
    }
  | {
      kind: "miss";
      at: string[];
      crossed: Handle<unknown>[];
      entered: ChainNode[];
      bound: Bound | undefined;
    };

const HOP_LIMIT = 32;

export function walk(
  start: ChainNode,
  rel: string[],
  options: { followLast?: boolean } = {}
): WalkResult {
  const origin = start;
  const crossed: Handle<unknown>[] = [];
  const entered: ChainNode[] = [];
  let bound: Bound | undefined;
  let at = rel; // in the requester's coordinates
  let cur = rel; // in `start`'s coordinates
  for (let hops = 0; hops <= HOP_LIMIT; hops++) {
    const found = locate(start, cur);
    if (found.handle) {
      // A link or bind found here sits at the end of the path — `followLast:
      // false` stops on the entry itself instead of crossing it, which is
      // how `set` rebinds a link rather than write through it.
      if (options.followLast !== false) {
        const link = linkTarget(found.handle);
        if (link) {
          crossed.push(found.handle);
          start = origin; // a link starts again from the requester
          at = cur = link;
          continue;
        }
        const bind = bindTarget(found.handle);
        if (bind) {
          entered.push(bind);
          bound = { dir: bind, rest: [] };
          start = bind; // a bind continues inside the mounted directory
          cur = [];
          continue;
        }
      }
      return {
        kind: "found",
        at,
        handle: found.handle,
        crossed,
        entered,
        bound,
      };
    }
    if (found.hasEntries)
      return { kind: "found", at, handle: undefined, crossed, entered, bound };
    // Structure ran out. Follow whatever the longest prefix holds.
    const hop = followable(start, cur);
    if (!hop) return { kind: "miss", at, crossed, entered, bound };
    if (hop.kind === "link") {
      crossed.push(hop.handle);
      start = origin;
      at = cur = hop.to;
    } else {
      entered.push(hop.bind);
      bound = { dir: hop.bind, rest: hop.rest };
      start = hop.bind;
      cur = hop.rest;
    }
  }
  throw new Error(`link or bind loop at ${cur.join("/")}`);
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

type Hop =
  | { kind: "link"; to: string[]; handle: Handle<unknown> }
  | { kind: "bind"; bind: ChainNode; rest: string[] };

// the longest prefix holding a link or an open bind, searched here then
// climbing; the first position holding anything decides — a plain value
// blocks the search
function followable(start: ChainNode, cur: string[]): Hop | undefined {
  let dir: ChainNode | undefined = start;
  let p = cur;
  let top = p.length - 1;
  while (dir) {
    for (let j = top; j >= (isUrlRooted(p) ? 1 : 0); j--) {
      const prefix = locate(dir, p.slice(0, j));
      if (prefix.handle) {
        const link = linkTarget(prefix.handle);
        if (link)
          return {
            kind: "link",
            to: [...link, ...p.slice(j)],
            handle: prefix.handle,
          };
        const bind = bindTarget(prefix.handle);
        if (bind) return { kind: "bind", bind, rest: p.slice(j) };
        return undefined;
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

// a directory mounted as a handle is a bind; a closed one reads as nothing
function bindTarget(handle: Handle<unknown>): ChainNode | undefined {
  const dir = handle as unknown as Partial<ChainNode>;
  if (!(dir.overlay instanceof Overlay)) return undefined;
  const node = handle as unknown as ChainNode;
  return node.closed ? undefined : node;
}

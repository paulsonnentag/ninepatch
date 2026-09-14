// resolution, as the spec states it: locate structurally, follow links
// (restarting from the last bind entered, else the requester), enter binds
// (continuing inside the mounted directory), step into values by key,
// never hold an absolute path

import { field, type Handle } from "./handle";
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

// `at` is the path as the requester wrote it, URL-rooted once a link was
// crossed; `base` is where links restart — the last bind entered, else the
// requester; `entered` is every bind crossed, in order; `crossed` every
// handle read on the way; `owner` is whose own entry the handle is, at
// `ownerPath` in its overlay — neither for a field stepped into in a
// value; `linkOwner` is whose entry held the last link crossed — the
// directory a mount past that link belongs to
export type WalkResult =
  | {
      kind: "found";
      at: string[];
      handle: Handle<unknown> | undefined;
      owner: ChainNode | undefined;
      ownerPath: string[] | undefined;
      crossed: Handle<unknown>[];
      entered: ChainNode[];
      bound: Bound | undefined;
      base: ChainNode;
      last: "link" | "bind" | undefined;
      linkOwner: ChainNode | undefined;
    }
  | {
      kind: "miss";
      at: string[];
      crossed: Handle<unknown>[];
      entered: ChainNode[];
      bound: Bound | undefined;
      base: ChainNode;
      last: "link" | "bind" | undefined;
      linkOwner: ChainNode | undefined;
    };

const HOP_LIMIT = 32;

type Hit = {
  handle: Handle<unknown>;
  rest: string[];
  owner?: ChainNode;
  ownerPath?: string[];
};

export function walk(
  start: ChainNode,
  rel: string[],
  options: { followLast?: boolean } = {}
): WalkResult {
  const origin = start;
  const crossed: Handle<unknown>[] = [];
  const entered: ChainNode[] = [];
  let bound: Bound | undefined;
  let base = start;
  let last: "link" | "bind" | undefined;
  let linkOwner: ChainNode | undefined;
  let anchor: ChainNode | undefined; // whose entry the current hit came through
  let at = rel; // as the requester wrote it
  let cur = rel; // in `start`'s coordinates
  let hit: Hit | undefined;
  const miss = (): WalkResult => ({
    kind: "miss",
    at,
    crossed,
    entered,
    bound,
    base,
    last,
    linkOwner,
  });
  let hops = 0;
  const hop = () => {
    if (++hops > HOP_LIMIT)
      throw new Error(`link or bind loop at ${cur.join("/")}`);
  };
  for (;;) {
    if (!hit) {
      const found = locate(start, cur, origin);
      if (found.handle) {
        anchor = found.owner;
        hit = {
          handle: found.handle,
          rest: [],
          owner: found.owner,
          ownerPath: found.ownerPath,
        };
      } else {
        const next = followable(start, cur, origin);
        if (!next) {
          if (found.hasEntries)
            return {
              kind: "found",
              at,
              handle: undefined,
              owner: undefined,
              ownerPath: undefined,
              crossed,
              entered,
              bound,
              base,
              last,
              linkOwner,
            };
          return miss();
        }
        if (next.kind === "link") {
          hop();
          crossed.push(next.handle);
          last = "link";
          linkOwner = next.owner;
          start = base;
          at = cur = next.to;
          continue;
        }
        if (next.kind === "bind") {
          hop();
          entered.push(next.bind);
          last = "bind";
          bound = { dir: next.bind, rest: next.rest };
          base = start = next.bind;
          cur = next.rest;
          continue;
        }
        anchor = next.owner;
        hit = { handle: next.handle, rest: next.rest };
      }
    }
    // `followLast: false` stops on the entry at the end of the path instead
    // of crossing it — how `set` rebinds a link rather than write through
    const atEnd = hit.rest.length === 0;
    if (!(atEnd && options.followLast === false)) {
      const link = linkTarget(hit.handle);
      if (link) {
        hop();
        crossed.push(hit.handle);
        last = "link";
        linkOwner = anchor; // a URL in a field belongs to whoever holds the entry it was read through
        start = base;
        at = cur = [...link, ...hit.rest];
        hit = undefined;
        continue;
      }
      const bind = bindTarget(hit.handle);
      if (bind) {
        hop();
        entered.push(bind);
        last = "bind";
        bound = { dir: bind, rest: hit.rest };
        base = start = bind;
        cur = hit.rest;
        hit = undefined;
        continue;
      }
    }
    if (atEnd)
      return {
        kind: "found",
        at,
        handle: hit.handle,
        owner: hit.owner,
        ownerPath: hit.ownerPath,
        crossed,
        entered,
        bound,
        base,
        last,
        linkOwner,
      };
    // step into the value by one key
    const [key, ...more] = hit.rest;
    if (!hasKey(hit.handle, key)) return miss();
    crossed.push(hit.handle);
    hit = { handle: fieldOf(hit.handle, key), rest: more };
  }
}

// where `mount`/`unmount` of `rel` land: the overlay to write and the path
// in it — a bind's own at the remaining path; past a link, the URL area
// of the directory whose entry the link is, so everything reaching the
// document through that link sees the mount; else the requester's at `rel`
export function canonical(
  start: ChainNode,
  rel: string[]
): { dir: ChainNode; names: string[] } {
  if (isUrlRooted(rel)) return { dir: start, names: rel }; // a URL is absolute
  const prefix = rel.slice(0, -1);
  const name = rel[rel.length - 1];
  const result = walk(start, prefix);
  if (result.last === "bind" && result.bound)
    return { dir: result.bound.dir, names: [...result.bound.rest, name] };
  if (result.last === "link") {
    if (result.kind === "miss" && result.at.length > 1) {
      const doc = locate(result.base, [result.at[0]], start);
      if (!doc.handle)
        throw new Error(
          `cannot mount across a link that is not loaded: ${rel.join("/")} — open it first`
        );
    }
    return {
      dir: result.linkOwner ?? result.base,
      names: [...result.at, name],
    };
  }
  return { dir: start, names: rel };
}

// every name a reader of `rel` can see: own entries up the chain, minus
// cuts, plus the keys of the value there; never asks a server
export function names(start: ChainNode, rel: string[]): string[] {
  const out = new Set<string>();
  const hidden = new Set<string>();
  collectNames(start, rel, out, hidden);
  let result: WalkResult | undefined;
  try {
    result = walk(start, rel);
  } catch {
    result = undefined;
  }
  if (result) {
    if (result.last === "bind" && result.bound)
      collectNames(result.bound.dir, result.bound.rest, out, hidden);
    else if (result.last === "link")
      collectNames(result.linkOwner ?? result.base, result.at, out, hidden);
    if (result.kind === "found" && result.handle) {
      let value: unknown;
      try {
        value = result.handle.value;
      } catch {
        value = undefined;
      }
      if (typeof value === "object" && value !== null)
        for (const key of Object.keys(value))
          if (!hidden.has(key)) out.add(key);
    }
  }
  return [...out];
}

function collectNames(
  start: ChainNode,
  rel: string[],
  out: Set<string>,
  hidden: Set<string>
): void {
  let cur = rel;
  for (let dir: ChainNode | undefined = start; dir; dir = dir.parent) {
    const listing = dir.overlay.list(cur);
    for (const name of listing.names) if (!hidden.has(name)) out.add(name);
    for (const name of listing.cuts) hidden.add(name);
    if (listing.blocked) return;
    cur = isUrlRooted(cur) ? cur : [...dir.path, ...cur];
  }
}

// own entries at `rel`; a cut stops the climb; else the parent gets `path +
// rel`. A URL reads the same everywhere: one not found from `start` is
// looked for from `origin` too, where the requester's fills are.
type Located = {
  handle: Handle<unknown> | undefined;
  hasEntries: boolean;
  owner?: ChainNode; // whose overlay held it, and where in it
  ownerPath?: string[];
};

export function locate(
  start: ChainNode,
  rel: string[],
  origin?: ChainNode
): Located {
  const found = locateChain(start, rel);
  if (found.handle || !origin || origin === start || !isUrlRooted(rel))
    return found;
  const again = locateChain(origin, rel);
  return { ...again, hasEntries: found.hasEntries || again.hasEntries };
}

function locateChain(start: ChainNode, rel: string[]): Located {
  let hasEntries = false;
  let cur = rel;
  for (let dir: ChainNode | undefined = start; dir; dir = dir.parent) {
    const found = dir.overlay.lookup(cur);
    if (found.handle)
      return {
        handle: found.handle,
        hasEntries: hasEntries || found.hasEntries,
        owner: dir,
        ownerPath: cur,
      };
    hasEntries ||= found.hasEntries;
    if (found.cutBlocked) break;
    cur = isUrlRooted(cur) ? cur : [...dir.path, ...cur];
  }
  return { handle: undefined, hasEntries };
}

type Hop =
  | {
      kind: "link";
      to: string[];
      handle: Handle<unknown>;
      owner: ChainNode | undefined;
    }
  | { kind: "bind"; bind: ChainNode; rest: string[] }
  | {
      kind: "value";
      handle: Handle<unknown>;
      rest: string[];
      owner: ChainNode | undefined;
    };

// the longest prefix holding anything, searched here then climbing: a
// link or an open bind to follow, or a value to step into
function followable(
  start: ChainNode,
  cur: string[],
  origin: ChainNode
): Hop | undefined {
  let dir: ChainNode | undefined = start;
  let p = cur;
  let top = p.length - 1;
  while (dir) {
    for (let j = top; j >= (isUrlRooted(p) ? 1 : 0); j--) {
      const prefix = locate(dir, p.slice(0, j), origin);
      if (prefix.handle) {
        const rest = p.slice(j);
        const link = linkTarget(prefix.handle);
        if (link)
          return {
            kind: "link",
            to: [...link, ...rest],
            handle: prefix.handle,
            owner: prefix.owner,
          };
        const bind = bindTarget(prefix.handle);
        if (bind) return { kind: "bind", bind, rest };
        return {
          kind: "value",
          handle: prefix.handle,
          rest,
          owner: prefix.owner,
        };
      }
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

function hasKey(handle: Handle<unknown>, key: string): boolean {
  let value: unknown;
  try {
    value = handle.value;
  } catch {
    return false;
  }
  return typeof value === "object" && value !== null && key in value;
}

// one field handle per (source, key), so a re-walk lands on the same object
const fields = new WeakMap<Handle<unknown>, Map<string, Handle<unknown>>>();

function fieldOf(source: Handle<unknown>, key: string): Handle<unknown> {
  let byKey = fields.get(source);
  if (!byKey) {
    byKey = new Map();
    fields.set(source, byKey);
  }
  let handle = byKey.get(key);
  if (!handle) {
    handle = field(source, [key]);
    byKey.set(key, handle);
  }
  return handle;
}

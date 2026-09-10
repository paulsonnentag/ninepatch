/** The directory: a position plus a private overlay. `open` walks down
 * (or asks for a URL) and returns a new directory positioned there;
 * misses bubble to the servers registered up the chain of directories this
 * one was opened or forked from; unanswered requests reject with NotFound.
 * See spec.md — it is canonical. */

import {
  brand,
  derive,
  Emitter,
  isHandle,
  onChange,
  readonly,
  wrap,
  type Handle,
} from "./handle";
import { Overlay, type Entry } from "./overlay";
import { isUrlRooted, parsePath, startsWith, type Path } from "./path";
import { walk, type WalkResult } from "./walk";

export type { Entry };

export type Directory = {
  /** The name given to fork(); for open(), the path opened; "root" for
   * createDirectory(). A label, nothing more. */
  readonly name: string;
  /** This directory's own overlay — what it mounted, was served, or cut.
   * Says nothing about what it inherits. Read-only. */
  readonly entries: Handle<Entry[]>;
  /** Everything opened or forked from this directory that is still open.
   * Read-only. */
  readonly children: Handle<Directory[]>;
  /** Aborts when this directory is closed — by its holder, or because
   * something it was opened or forked from was. */
  readonly signal: AbortSignal;

  /** Walk down (relative path) or ask for a document (URL). Returns a new
   * directory positioned there. Name a type and you get a directory that
   * is also a handle; don't, and you get a bare directory. Rejects with
   * NotFound once the servers have answered and nothing is there. The
   * empty path throws — use fork(). */
  open<T = never>(path: Path): Promise<Opened<T>>;

  /** A new directory at this same position with its own overlay: reads
   * fall through to this one, writes stay in the fork. */
  fork<Self>(this: Self, name?: string): Self;

  /** Into this directory's overlay. Replaces what this directory had
   * there. A Handle is used as-is; anything else is wrapped in a new one. */
  mount(path: Path, what: unknown): void;
  /** Remove, and cut fall-through at that node — permanently, for this
   * directory and everything opened or forked from it. Mounting over the
   * cut is allowed. */
  unmount(path: Path): void;

  /** Answer misses at or below here — from this directory or anything
   * opened or forked from it. Returns unregister. */
  serve(server: Server): () => void;

  /** Release this directory and everything opened or forked from it. */
  close(): void;
};

/** What answers requests. `target`: the names from the serving directory
 * to the node the walk is trying to reach; if it went through a link, the
 * first is the URL. `from`: the requester's overlay, seen from the serving
 * directory; anything opened through it belongs to the requester and
 * closes with it. */
export type Server = {
  /** An open found nothing there. Must return a promise; decline by
   * returning without mounting. */
  open?(target: string[], from: Directory): Promise<void>;
  /** The last directory at or below `target` closed. */
  close?(target: string[], from: Directory): void;
};

export type Opened<T> = [T] extends [never] ? Directory : Directory & Handle<T>;

export class NotFound extends Error {
  constructor(readonly target: string[]) {
    super(`not found: ${target.join("/")}`);
    this.name = "NotFound";
  }
}

export function createDirectory(): Directory {
  return new DirectoryImpl(undefined, [], "root") as unknown as Directory;
}

type Held = { requester: DirectoryImpl; key: string };
type Fired = { key: string; target: string[] };

export class DirectoryImpl {
  readonly [brand] = true;
  readonly name: string;
  readonly overlay = new Overlay();
  readonly parent: DirectoryImpl | undefined;
  /** Position relative to parent, as requested — links are re-followed on
   * every read, so a shadowed URL retargets everything downstream. */
  readonly base: string[];
  /** Absolute position: origin-rooted names, or URL-rooted once the chain
   * went through a URL. */
  readonly pos: string[];

  readonly entries: Handle<Entry[]>;
  readonly children: Handle<DirectoryImpl[]>;
  readonly servers = new Set<Server>();
  /** Requests this directory fired as requester, refcounted by the
   * directories holding their answers. */
  readonly served = new Map<string, { target: string[]; count: number }>();
  readonly pending = new Map<string, Promise<void>>();
  /** The value here moved — the Watch says when. */
  readonly changes = new Emitter();

  private readonly kids = new Set<DirectoryImpl>();
  private readonly kidsChanged = new Emitter();
  private readonly controller = new AbortController();
  private held: Held[] = [];
  private watch: Watch | undefined;

  constructor(parent: DirectoryImpl | undefined, base: string[], name: string) {
    this.parent = parent;
    this.base = base;
    this.name = name;
    this.pos = !parent || isUrlRooted(base) ? base : [...parent.pos, ...base];
    this.entries = readonly(() => this.overlay.entries(), this.overlay.mutated);
    this.children = readonly(() => [...this.kids], this.kidsChanged);
  }

  // --- directory surface ---------------------------------------------------

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  async open(path: Path): Promise<DirectoryImpl> {
    this.assertOpen();
    const rel = parsePath(path);
    if (rel.length === 0) throw new Error("empty path — use fork()");
    return this.openRel(rel);
  }

  fork(name = "fork"): DirectoryImpl {
    this.assertOpen();
    return this.adopt(new DirectoryImpl(this, [], name));
  }

  mount(path: Path, what: unknown): void {
    const rel = parsePath(path);
    if (rel.length === 0) throw new Error("empty path");
    this.overlay.mount(rel, isHandle(what) ? what : wrap(what));
  }

  unmount(path: Path): void {
    const rel = parsePath(path);
    if (rel.length === 0) throw new Error("empty path");
    this.overlay.unmount(rel);
  }

  serve(server: Server): () => void {
    this.servers.add(server);
    return () => this.servers.delete(server);
  }

  close(): void {
    if (this.closed) return;
    this.controller.abort();
    for (const child of [...this.kids].reverse()) child.close();
    this.kids.clear();
    this.watch?.stop();
    this.changes.clear();
    this.kidsChanged.clear();
    this.overlay.mutated.clear();
    this.servers.clear();
    if (this.parent?.kids.delete(this)) this.parent.kidsChanged.emit();
    const held = this.held;
    this.held = [];
    for (const { requester, key } of held) {
      const entry = requester.served.get(key);
      if (!entry) continue;
      entry.count--;
      if (entry.count <= 0) {
        requester.served.delete(key);
        fireClose(requester, entry.target);
      }
    }
  }

  // --- handle surface ------------------------------------------------------

  get value(): unknown {
    const result = walk(this, this.pos);
    if (result.kind !== "found" || !result.handle)
      throw new NotFound(this.relTarget(result.at));
    return result.handle.value;
  }

  set(next: unknown): void {
    this.terminal().set(next);
  }

  change(fn: (value: unknown) => void): void {
    this.terminal().change(fn);
  }

  /** The store contract over a live read: `fn(value)` now if something is
   * there, and each time the re-walk settles on something. While the walk
   * lands on nothing, subscribers stay quiet and `value` throws. */
  subscribe(fn: (value: unknown) => void): () => void {
    this.ensureWatch();
    const notify = () => {
      let value: unknown;
      try {
        value = this.value;
      } catch (e) {
        if (e instanceof NotFound) return;
        throw e;
      }
      fn(value);
    };
    notify();
    return this.changes.on(notify);
  }

  // --- internals -----------------------------------------------------------

  async openRel(rel: string[]): Promise<DirectoryImpl> {
    const abs = isUrlRooted(rel) ? rel : [...this.pos, ...rel];
    const { fired } = await resolveWithFills(this, abs);
    const child = this.adopt(new DirectoryImpl(this, rel, rel.join("/")));
    child.hold(this, fired);
    return child;
  }

  hold(requester: DirectoryImpl, fired: Fired[]): void {
    for (const { key, target } of fired) {
      let entry = requester.served.get(key);
      if (!entry) {
        entry = { target, count: 0 };
        requester.served.set(key, entry);
      }
      entry.count++;
      this.held.push({ requester, key });
    }
  }

  relTarget(abs: string[]): string[] {
    if (isUrlRooted(abs)) return abs;
    if (isUrlRooted(this.pos)) return abs;
    const rel = abs.slice(this.pos.length);
    return rel.length > 0 ? rel : abs;
  }

  private get closed(): boolean {
    return this.controller.signal.aborted;
  }

  private adopt(child: DirectoryImpl): DirectoryImpl {
    this.kids.add(child);
    this.kidsChanged.emit();
    return child;
  }

  private terminal(): Handle<unknown> {
    const result = walk(this, this.pos);
    if (result.kind !== "found" || !result.handle)
      throw new NotFound(this.relTarget(result.at));
    return result.handle;
  }

  private ensureWatch(): void {
    if (!this.watch && !this.closed) this.watch = new Watch(this);
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("directory is closed");
  }
}

/** The miss/fill cycle: walk; on a miss, ask the servers up the chain
 * (deduped per target per requester), await the handlers, re-walk. A
 * re-walk that misses somewhere new means a link was mounted and followed
 * — go again. The same miss twice is NotFound. */
async function resolveWithFills(
  requester: DirectoryImpl,
  abs: string[]
): Promise<{ result: Extract<WalkResult, { kind: "found" }>; fired: Fired[] }> {
  const fired: Fired[] = [];
  for (let attempt = 0; attempt < 32; attempt++) {
    const result = walk(requester, abs);
    if (result.kind === "found") return { result, fired };
    const key = JSON.stringify(result.at);
    const existing = requester.pending.get(key);
    if (existing) {
      await existing;
    } else {
      const request = fireOpen(requester, result.at);
      requester.pending.set(key, request);
      try {
        await request;
      } finally {
        requester.pending.delete(key);
      }
    }
    fired.push({ key, target: result.at });
    const again = walk(requester, abs);
    if (again.kind === "found") return { result: again, fired };
    if (JSON.stringify(again.at) === key)
      throw new NotFound(requester.relTarget(again.at));
  }
  throw new NotFound(requester.relTarget(abs));
}

async function fireOpen(
  requester: DirectoryImpl,
  absTarget: string[]
): Promise<void> {
  const calls: Promise<void>[] = [];
  for (let dir: DirectoryImpl | undefined = requester; dir; dir = dir.parent) {
    if (dir.servers.size === 0) continue;
    const target = targetFor(dir, absTarget);
    if (!target) continue;
    const from = new FromView(requester, dir) as unknown as Directory;
    for (const server of [...dir.servers]) {
      if (!server.open) continue;
      const out = server.open(target, from);
      if (!out || typeof out.then !== "function")
        throw new TypeError("open handler must return a promise");
      calls.push(out);
    }
  }
  await Promise.all(calls);
}

function fireClose(requester: DirectoryImpl, absTarget: string[]): void {
  for (let dir: DirectoryImpl | undefined = requester; dir; dir = dir.parent) {
    if (dir.servers.size === 0) continue;
    const target = targetFor(dir, absTarget);
    if (!target) continue;
    const from = new FromView(requester, dir) as unknown as Directory;
    for (const server of [...dir.servers]) server.close?.(target, from);
  }
}

function targetFor(dir: DirectoryImpl, abs: string[]): string[] | undefined {
  if (isUrlRooted(abs)) return abs;
  if (isUrlRooted(dir.pos)) return undefined;
  return startsWith(abs, dir.pos) ? abs.slice(dir.pos.length) : undefined;
}

/** The requester's overlay, seen from a server's position: paths are
 * translated into the requester's coordinates, so fills land in the
 * requester's overlay and anything opened through it belongs to the
 * requester and closes with it. */
class FromView {
  readonly [brand] = true;
  /** The requester's entries, in the server's coordinates where those
   * exist; URL-rooted paths are the same everywhere. */
  readonly entries: Handle<Entry[]>;

  constructor(
    private readonly requester: DirectoryImpl,
    private readonly server: DirectoryImpl
  ) {
    const prefix =
      isUrlRooted(server.pos) || isUrlRooted(requester.pos)
        ? []
        : requester.pos.slice(server.pos.length);
    this.entries = derive(requester.entries, (entries) =>
      entries.map(({ path, handle }) => ({
        path: isUrlRooted(path) ? path : [...prefix, ...path],
        handle,
      }))
    );
  }

  get name(): string {
    return this.requester.name;
  }

  get children(): Handle<DirectoryImpl[]> {
    return this.requester.children;
  }

  get signal(): AbortSignal {
    return this.requester.signal;
  }

  open(path: Path): Promise<DirectoryImpl> {
    const rel = this.rel(path);
    if (rel.length === 0) throw new Error("empty path — use fork()");
    return this.requester.openRel(rel);
  }

  fork(name?: string): DirectoryImpl {
    return this.requester.fork(name);
  }

  mount(path: Path, what: unknown): void {
    this.requester.mount(this.rel(path), what);
  }

  unmount(path: Path): void {
    this.requester.unmount(this.rel(path));
  }

  serve(server: Server): () => void {
    return this.requester.serve(server);
  }

  close(): void {
    // The requester's lifetime is the requester's business.
  }

  get value(): unknown {
    return this.requester.value;
  }

  set(next: unknown): void {
    this.requester.set(next);
  }

  change(fn: (value: unknown) => void): void {
    this.requester.change(fn);
  }

  subscribe(fn: (value: unknown) => void): () => void {
    return this.requester.subscribe(fn);
  }

  private rel(path: Path): string[] {
    const names = parsePath(path);
    if (isUrlRooted(names)) return names;
    if (isUrlRooted(this.server.pos) || isUrlRooted(this.requester.pos))
      throw new Error("fill outside the requester's subtree");
    const abs = [...this.server.pos, ...names];
    if (!startsWith(abs, this.requester.pos))
      throw new Error("fill outside the requester's subtree");
    return abs.slice(this.requester.pos.length);
  }
}

/** Live reads: re-walk when any overlay in the chain mutates or any handle
 * the walk crossed fires; `changes` fires once the re-walk settles — which
 * may involve the servers, when a retargeted link points somewhere not
 * yet filled. */
class Watch {
  private readonly unsubOverlays: (() => void)[] = [];
  private unsubHandles: (() => void)[] = [];
  private lastTerminal: Handle<unknown> | undefined;
  private generation = 0;
  private handleFired = false;
  private stopped = false;

  constructor(private readonly dir: DirectoryImpl) {
    for (let n: DirectoryImpl | undefined = dir; n; n = n.parent) {
      this.unsubOverlays.push(n.overlay.mutated.on(() => this.trigger(false)));
    }
    const result = this.safeWalk();
    this.resubscribe(result);
    this.lastTerminal = result?.kind === "found" ? result.handle : undefined;
  }

  stop(): void {
    this.stopped = true;
    for (const unsub of this.unsubOverlays) unsub();
    for (const unsub of this.unsubHandles) unsub();
    this.unsubHandles = [];
  }

  private trigger(handleFired: boolean): void {
    if (this.stopped) return;
    this.handleFired ||= handleFired;
    const generation = ++this.generation;
    queueMicrotask(() => void this.run(generation));
  }

  private async run(generation: number): Promise<void> {
    if (generation !== this.generation || this.stopped) return;
    const fired = this.handleFired;
    this.handleFired = false;
    let terminal: Handle<unknown> | undefined;
    try {
      const { result, fired: requests } = await resolveWithFills(
        this.dir,
        this.dir.pos
      );
      if (generation !== this.generation || this.stopped) return;
      this.dir.hold(this.dir, requests);
      terminal = result.handle;
    } catch {
      terminal = undefined;
    }
    if (generation !== this.generation || this.stopped) return;
    this.resubscribe(this.safeWalk());
    const changed = fired || terminal !== this.lastTerminal;
    this.lastTerminal = terminal;
    if (changed) this.dir.changes.emit();
  }

  private safeWalk(): WalkResult | undefined {
    try {
      return walk(this.dir, this.dir.pos);
    } catch {
      return undefined;
    }
  }

  private resubscribe(result: WalkResult | undefined): void {
    for (const unsub of this.unsubHandles) unsub();
    this.unsubHandles = [];
    if (!result) return;
    const handles = [...result.crossed];
    if (result.kind === "found" && result.handle) handles.push(result.handle);
    for (const handle of handles) {
      try {
        this.unsubHandles.push(onChange(handle, () => this.trigger(true)));
      } catch {
        // Its first read threw (a derivation over nothing yet): the overlay
        // chain still triggers a re-walk, and we subscribe again then.
      }
    }
  }
}

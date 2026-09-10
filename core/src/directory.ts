/** The directory: a collection of named things — its own overlay of
 * entries, the directory it came from, and the path it was opened at
 * there. Reads check the own entries and fall through — live — to the
 * parent at `path + rel`; misses bubble to the servers registered up the
 * chain; unanswered requests reject with NotFound. A process is a module
 * running in a directory: `spawn` imports it and runs its default export
 * with a directory that shares these entries and has a lifetime of its
 * own. See spec.md — it is canonical. */

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
  /** The name given to fork() or spawn(); for open(), the path opened;
   * "root" for createDirectory(). A label, nothing more. */
  readonly name: string;
  /** This directory's own entries — what it mounted, was served, or cut.
   * Says nothing about what it inherits. Read-only. */
  readonly entries: Handle<Entry[]>;
  /** Everything opened or forked from this directory that is still open.
   * Read-only. */
  readonly children: Handle<Directory[]>;
  /** Aborts when this directory is closed — by its holder, or because
   * something it was opened or forked from was. */
  readonly signal: AbortSignal;

  /** Walk down (relative path) or ask for a document (URL). Returns a new
   * directory for what is there; it remembers the path and reads through
   * this directory. Name a type and you get a directory that is also a
   * handle; don't, and you get a bare directory. Rejects with NotFound
   * once the servers have answered and nothing is there. The empty path
   * throws — use fork(). */
  open<T = never>(path: Path): Promise<Opened<T>>;

  /** A new directory at the empty path: the same names, its own entries.
   * Reads fall through to this one, writes stay in the fork. */
  fork<Self>(this: Self, name?: string): Self;

  /** Into this directory's own entries. Replaces what this directory had
   * there. A Handle is used as-is; anything else is wrapped in a new one. */
  mount(path: Path, what: unknown): void;
  /** Remove, and cut fall-through at that node — permanently, for this
   * directory and everything opened or forked from it. Mounting over the
   * cut is allowed. */
  unmount(path: Path): void;

  /** Answer misses at or below here — from this directory or anything
   * opened or forked from it. Returns unregister. */
  serve(server: Server): () => void;

  /** Import the module at `url` and run its default export here, sharing
   * these entries, with its own lifetime. */
  spawn(name: string, url: string): Process;

  /** Release this directory: kill the processes running at it, then close
   * everything opened or forked from it. */
  close(): void;
};

/** What answers requests. `target`: the missing path as it reads from the
 * serving directory — the requester's path, grown by each level it
 * climbed; through a link, the first name is the URL. `from`: the
 * requester's entries, seen from the serving directory; anything opened
 * through it belongs to the requester and closes with it. */
export type Server = {
  /** An open found nothing there. Must return a promise; decline by
   * returning without mounting. */
  open?(target: string[], from: Directory): Promise<void>;
  /** The last directory at or below `target` closed. */
  close?(target: string[], from: Directory): void;
};

export type Opened<T> = [T] extends [never] ? Directory : Directory & Handle<T>;

/** What spawn runs: a module's default export. Returning ends nothing;
 * closing `dir` does. */
export type Main = (dir: Directory) => Promise<void> | void;

/** A directory with a module running in it. */
export type Process = {
  readonly pid: string; // a UUID
  readonly name: string;
  /** The module spawn imported, e.g. "./tools/chat.tsx". */
  readonly url: string;
  /** Where it was spawned; nothing else leads there. */
  readonly at: Directory;
  /** What the default export received: the entries of `at`, an empty
   * path, and its own lifetime. `children` is what it opened. `close()`
   * kills; `signal` aborts then. */
  readonly dir: Directory;
  /** The default export's return. A failed import or a throw rejects it
   * and kills. */
  readonly terminated: Promise<void>;
};

/** The origin, and the only view of the process table. A fork of the root
 * is a plain Directory: the table does not fork. */
export type Root = Omit<Directory, "fork"> & {
  fork(name?: string): Directory;
  /** Every process running at or below this root. Read-only. */
  readonly processes: Handle<Process[]>;
};

export class NotFound extends Error {
  constructor(readonly target: string[]) {
    super(`not found: ${target.join("/")}`);
    this.name = "NotFound";
  }
}

export function createDirectory(options?: {
  /** How spawn loads modules. The platform's import() by default. */
  import?(url: string): Promise<{ default: Main }>;
}): Root {
  return new DirectoryImpl(
    undefined,
    [],
    "root",
    undefined,
    options?.import
  ) as unknown as Root;
}

type Held = { requester: DirectoryImpl; key: string };
type Fired = { key: string; target: string[] };

export class DirectoryImpl {
  readonly [brand] = true;
  readonly name: string;
  readonly overlay: Overlay;
  readonly parent: DirectoryImpl | undefined;
  /** The path this directory was opened at, relative to `parent` — `[]`
   * for a fork or a process view. Links along it are re-followed on every
   * read, so a shadowed URL retargets everything downstream. */
  readonly path: string[];

  readonly entries: Handle<Entry[]>;
  readonly children: Handle<DirectoryImpl[]>;
  readonly servers = new Set<Server>();
  /** Requests this directory fired as requester, refcounted by the
   * directories holding their answers. */
  readonly served = new Map<string, { target: string[]; count: number }>();
  readonly pending = new Map<string, Promise<void>>();
  /** The value here moved — the Watch says when. */
  readonly changes = new Emitter();
  /** Every process at or below here. Only read on the root. */
  readonly processes: Handle<Process[]>;

  private readonly kids = new Set<DirectoryImpl>();
  private readonly kidsChanged = new Emitter();
  private readonly controller = new AbortController();
  /** True unless this is a process view sharing its parent's overlay. */
  private readonly ownsOverlay: boolean;
  /** The process views running at this directory. */
  private readonly spawned = new Set<DirectoryImpl>();
  /** The table — only the root's is written to. */
  private readonly table: Process[] = [];
  private readonly tableChanged = new Emitter();
  private readonly importer:
    ((url: string) => Promise<{ default: Main }>) | undefined;
  private held: Held[] = [];
  private watch: Watch | undefined;

  constructor(
    parent: DirectoryImpl | undefined,
    path: string[],
    name: string,
    overlay?: Overlay,
    importer?: (url: string) => Promise<{ default: Main }>
  ) {
    this.parent = parent;
    this.path = path;
    this.name = name;
    this.overlay = overlay ?? new Overlay();
    this.ownsOverlay = !overlay;
    this.importer = importer;
    this.entries = readonly(() => this.overlay.entries(), this.overlay.mutated);
    this.children = readonly(() => [...this.kids], this.kidsChanged);
    this.processes = readonly(() => [...this.table], this.tableChanged);
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

  spawn(name: string, url: string): Process {
    this.assertOpen();
    const view = new DirectoryImpl(this, [], name, this.overlay);
    const dir = view as unknown as Directory;
    const root = this.root();
    const terminated = (async () => {
      const mod = await root.load(url);
      if (view.signal.aborted) return;
      if (typeof mod?.default !== "function")
        throw new TypeError(`no default export: ${url}`);
      await mod.default(dir);
    })();
    const process: Process = {
      pid: crypto.randomUUID(),
      name,
      url,
      at: this as unknown as Directory,
      dir,
      terminated,
    };
    this.spawned.add(view);
    root.table.push(process);
    root.tableChanged.emit();
    view.signal.addEventListener("abort", () => {
      this.spawned.delete(view);
      const index = root.table.indexOf(process);
      if (index >= 0) {
        root.table.splice(index, 1);
        root.tableChanged.emit();
      }
    });
    terminated.catch(() => view.close());
    return process;
  }

  close(): void {
    if (this.closed) return;
    this.controller.abort();
    for (const view of [...this.spawned].reverse()) view.close();
    for (const child of [...this.kids].reverse()) child.close();
    this.kids.clear();
    this.watch?.stop();
    this.changes.clear();
    this.kidsChanged.clear();
    this.tableChanged.clear();
    if (this.ownsOverlay) this.overlay.mutated.clear();
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
    const result = walk(this, []);
    if (result.kind !== "found" || !result.handle)
      throw new NotFound(result.at);
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
    const { fired } = await resolveWithFills(this, rel);
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

  root(): DirectoryImpl {
    let dir: DirectoryImpl = this;
    while (dir.parent) dir = dir.parent;
    return dir;
  }

  private load(url: string): Promise<{ default: Main }> {
    const importer =
      this.importer ??
      ((u: string) =>
        import(/* @vite-ignore */ u) as Promise<{ default: Main }>);
    return importer(url);
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
    const result = walk(this, []);
    if (result.kind !== "found" || !result.handle)
      throw new NotFound(result.at);
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
  rel: string[]
): Promise<{ result: Extract<WalkResult, { kind: "found" }>; fired: Fired[] }> {
  const fired: Fired[] = [];
  for (let attempt = 0; attempt < 32; attempt++) {
    const result = walk(requester, rel);
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
    const again = walk(requester, rel);
    if (again.kind === "found") return { result: again, fired };
    if (JSON.stringify(again.at) === key) throw new NotFound(again.at);
  }
  throw new NotFound(rel);
}

/** Climb from the requester, growing the target by each level's path —
 * every server hears the miss as it reads from its own directory. */
async function fireOpen(
  requester: DirectoryImpl,
  target: string[]
): Promise<void> {
  const calls: Promise<void>[] = [];
  let cur = target;
  for (let dir: DirectoryImpl | undefined = requester; dir; dir = dir.parent) {
    if (dir.servers.size > 0) {
      const from = new FromView(requester, dir) as unknown as Directory;
      for (const server of [...dir.servers]) {
        if (!server.open) continue;
        const out = server.open(cur, from);
        if (!out || typeof out.then !== "function")
          throw new TypeError("open handler must return a promise");
        calls.push(out);
      }
    }
    cur = isUrlRooted(cur) ? cur : [...dir.path, ...cur];
  }
  await Promise.all(calls);
}

function fireClose(requester: DirectoryImpl, target: string[]): void {
  let cur = target;
  for (let dir: DirectoryImpl | undefined = requester; dir; dir = dir.parent) {
    if (dir.servers.size > 0) {
      const from = new FromView(requester, dir) as unknown as Directory;
      for (const server of [...dir.servers]) server.close?.(cur, from);
    }
    cur = isUrlRooted(cur) ? cur : [...dir.path, ...cur];
  }
}

/** The requester's entries, seen from a server's directory: paths are
 * translated by the prefix between them — the concatenated paths of
 * everything the requester hangs below the server — so fills land in the
 * requester's own entries and anything opened through it belongs to the
 * requester and closes with it. */
class FromView {
  readonly [brand] = true;
  /** The requester's entries, in the server's coordinates; URL-rooted
   * paths are the same everywhere. */
  readonly entries: Handle<Entry[]>;
  /** The requester's position inside the serving directory. URL-rooted
   * once a document boundary lies between them. */
  private readonly prefix: string[];

  constructor(
    private readonly requester: DirectoryImpl,
    server: DirectoryImpl
  ) {
    let prefix: string[] = [];
    for (
      let dir: DirectoryImpl | undefined = requester;
      dir && dir !== server;
      dir = dir.parent
    )
      if (!isUrlRooted(prefix)) prefix = [...dir.path, ...prefix];
    this.prefix = prefix;
    this.entries = derive(requester.entries, (entries) =>
      entries.map(({ path, handle }) => ({
        path: isUrlRooted(path) ? path : [...this.prefix, ...path],
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

  spawn(name: string, url: string): Process {
    return this.requester.spawn(name, url);
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
    if (isUrlRooted(this.prefix) || !startsWith(names, this.prefix))
      throw new Error("fill outside the requester's subtree");
    return names.slice(this.prefix.length);
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
      const { result, fired: requests } = await resolveWithFills(this.dir, []);
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
      return walk(this.dir, []);
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

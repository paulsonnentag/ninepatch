// the directory: own entries, live fall-through to the parent, misses
// bubbling to the servers up the chain. See spec.md — it is canonical.

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
  /** The fork/spawn name; for open(), the path. A label, nothing more. */
  readonly name: string;
  /** Where this was opened, relative to its source — `[]` for a fork. */
  readonly path: readonly string[];
  /** Own entries only — mounted, served, or cut; nothing inherited. */
  readonly entries: Handle<Entry[]>;
  /** Everything opened or forked from here that is still open. */
  readonly children: Handle<Directory[]>;
  /** Aborts when this directory is closed, directly or from above. */
  readonly signal: AbortSignal;

  /** A new directory reading through this one at `path`; a named type makes it a handle too. */
  open<T = never>(path: Path): Promise<Opened<T>>;

  /** The same names at the empty path; writes stay in the fork. */
  fork<Self>(this: Self, name?: string): Self;

  /** Into own entries, replacing. A Handle as-is; anything else wrapped. */
  mount(path: Path, what: unknown): void;
  /** Remove and cut fall-through there — permanently, for this and below. */
  unmount(path: Path): void;

  /** Answer misses at or below here. Returns unregister. */
  serve(server: Server): () => void;

  /** Run `url`'s default export here — same entries, its own lifetime. */
  spawn(name: string, url: string): Process;

  /** Kill the processes here, then close everything opened or forked. */
  close(): void;
};

// `target`: the missing path as the serving directory reads it; `from`:
// the requester's entries seen from there — fills land in the requester
export type Server = {
  /** An open found nothing. Decline by returning without mounting. */
  open?(target: string[], from: Directory): Promise<void>;
  /** The last directory at or below `target` closed. */
  close?(target: string[], from: Directory): void;
};

export type Opened<T> = [T] extends [never] ? Directory : Directory & Handle<T>;

/** What spawn runs. Returning ends nothing; closing `dir` does. */
export type Main = (dir: Directory) => Promise<void> | void;

/** A directory with a module running in it. */
export type Process = {
  readonly pid: string; // a UUID
  readonly name: string;
  /** The module spawn imported, e.g. "./tools/chat.tsx". */
  readonly url: string;
  /** Where it was spawned; nothing else leads there. */
  readonly at: Directory;
  /** What the default export received. `close()` kills; `signal` aborts. */
  readonly dir: Directory;
  /** The default export's return; a throw or failed import rejects and kills. */
  readonly terminated: Promise<void>;
};

// the origin, and the only view of the process table
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
  // links along the path re-follow on every read: a shadowed URL retargets
  readonly path: string[];

  readonly entries: Handle<Entry[]>;
  readonly children: Handle<DirectoryImpl[]>;
  readonly servers = new Set<Server>();
  // requests fired as requester, refcounted by the holders of the answers
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
    // Stop on a link at the end of the path: `set` rebinds the name —
    // like `ln -sf` — while `change` writes through to the target.
    this.terminal({ followLast: false }).set(next);
  }

  change(fn: (value: unknown) => void): void {
    this.terminal().change(fn);
  }

  // `fn(value)` now and on each settled re-walk; quiet while nothing is there
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

  private terminal(options: { followLast?: boolean } = {}): Handle<unknown> {
    const result = walk(this, [], options);
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

// walk; on a miss ask the servers (deduped), re-walk; the same miss twice
// is NotFound, a new one means a link appeared — go again
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

// every server up the chain hears the miss as it reads from its directory
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

// the requester's entries seen from a server: paths translated by the
// prefix between them, so fills land in the requester and close with it
class FromView {
  readonly [brand] = true;
  // the requester's entries in the server's coordinates
  readonly entries: Handle<Entry[]>;
  // the requester's position inside the serving directory
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

  get path(): readonly string[] {
    return this.requester.path;
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

// live reads: re-walk when an overlay in the chain mutates or a crossed
// handle fires; `changes` fires once the re-walk settles
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
      if (generation !== this.generation || this.stopped) {
        this.handleFired ||= fired; // superseded mid-await: the newer run reports it
        return;
      }
      this.dir.hold(this.dir, requests);
      terminal = result.handle;
    } catch {
      terminal = undefined;
    }
    if (generation !== this.generation || this.stopped) {
      this.handleFired ||= fired;
      return;
    }
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

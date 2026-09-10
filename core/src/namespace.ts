/** The namespace: a position plus a private overlay. `open` walks down
 * (or asks for a URL) and returns a new namespace positioned there;
 * misses bubble `open` up the chain of namespaces this one was opened or
 * forked from; unanswered requests reject with NotFound. See spec.md —
 * it is canonical. */

import { brand, Emitter, isHandle, wrap, type Handle } from "./handle";
import { Overlay } from "./overlay";
import { isUrlRooted, parsePath, startsWith, type Path } from "./path";
import { walk, type WalkResult } from "./walk";

export type Namespace = {
  /** Walk down (relative path) or ask for a document (URL). Returns a new
   * namespace positioned there. Name a type and you get a namespace that
   * is also a handle; don't, and you get a bare namespace. Rejects with
   * NotFound once the servers have answered and nothing is there. The
   * empty path throws — use fork(). */
  open<T = never>(path: Path): Promise<Opened<T>>;

  /** A new namespace at this same position with its own overlay: reads
   * fall through to this one, writes stay in the fork. */
  fork<Self>(this: Self): Self;

  /** Into this namespace's overlay. Replaces what this namespace had
   * there. A Handle is used as-is; anything else is wrapped in a new one. */
  mount(path: Path, what: unknown): void;
  /** Remove, and cut fall-through at that node — permanently, for this
   * namespace and everything opened or forked from it. Mounting over the
   * cut is allowed. */
  unmount(path: Path): void;

  on(event: "change", fn: () => void): () => void;
  on(
    event: "open",
    fn: (target: string[], from: Namespace) => Promise<void>
  ): () => void;
  on(
    event: "close",
    fn: (target: string[], from: Namespace) => void
  ): () => void;
  on(event: "destroy", fn: () => void): () => void;

  /** Release this namespace and everything opened or forked from it. */
  close(): void;
};

export type Opened<T> = [T] extends [never] ? Namespace : Namespace & Handle<T>;

export class NotFound extends Error {
  constructor(readonly target: string[]) {
    super(`not found: ${target.join("/")}`);
    this.name = "NotFound";
  }
}

export function createNamespace(): Namespace {
  return new NamespaceImpl(undefined, []) as unknown as Namespace;
}

type OpenListener = (target: string[], from: Namespace) => Promise<void>;
type CloseListener = (target: string[], from: Namespace) => void;

type Held = { requester: NamespaceImpl; key: string };
type Fired = { key: string; target: string[] };

export class NamespaceImpl {
  readonly [brand] = true;
  readonly overlay = new Overlay();
  readonly parent: NamespaceImpl | undefined;
  /** Position relative to parent, as requested — links are re-followed on
   * every read, so a shadowed URL retargets everything downstream. */
  readonly base: string[];
  /** Absolute position: origin-rooted names, or URL-rooted once the chain
   * went through a URL. */
  readonly pos: string[];

  readonly children = new Set<NamespaceImpl>();
  /** Requests this namespace fired as requester, refcounted by the
   * namespaces holding their answers. */
  readonly served = new Map<string, { target: string[]; count: number }>();
  readonly pending = new Map<string, Promise<void>>();
  readonly listeners = {
    change: new Emitter(),
    destroy: new Emitter(),
    open: new Set<OpenListener>(),
    close: new Set<CloseListener>(),
  };

  private held: Held[] = [];
  private closed = false;
  private watch: Watch | undefined;

  constructor(parent: NamespaceImpl | undefined, base: string[]) {
    this.parent = parent;
    this.base = base;
    this.pos = !parent || isUrlRooted(base) ? base : [...parent.pos, ...base];
  }

  // --- namespace surface ---------------------------------------------------

  async open(path: Path): Promise<NamespaceImpl> {
    this.assertOpen();
    const rel = parsePath(path);
    if (rel.length === 0) throw new Error("empty path — use fork()");
    return this.openRel(rel);
  }

  fork(): NamespaceImpl {
    this.assertOpen();
    const child = new NamespaceImpl(this, []);
    this.children.add(child);
    return child;
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

  on(
    event: "change" | "destroy" | "open" | "close",
    fn: (...args: never[]) => unknown
  ): () => void {
    if (event === "open") {
      const listener = fn as OpenListener;
      this.listeners.open.add(listener);
      return () => this.listeners.open.delete(listener);
    }
    if (event === "close") {
      const listener = fn as CloseListener;
      this.listeners.close.add(listener);
      return () => this.listeners.close.delete(listener);
    }
    if (event === "destroy") {
      const listener = fn as () => void;
      if (this.closed) {
        listener();
        return () => {};
      }
      return this.listeners.destroy.on(listener);
    }
    this.ensureWatch();
    return this.listeners.change.on(fn as () => void);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const child of [...this.children].reverse()) child.close();
    this.children.clear();
    this.watch?.stop();
    this.listeners.destroy.emit();
    this.listeners.destroy.clear();
    this.listeners.change.clear();
    this.listeners.open.clear();
    this.listeners.close.clear();
    this.parent?.children.delete(this);
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

  // --- internals -----------------------------------------------------------

  async openRel(rel: string[]): Promise<NamespaceImpl> {
    const abs = isUrlRooted(rel) ? rel : [...this.pos, ...rel];
    const { fired } = await resolveWithFills(this, abs);
    const child = new NamespaceImpl(this, rel);
    this.children.add(child);
    child.hold(this, fired);
    return child;
  }

  hold(requester: NamespaceImpl, fired: Fired[]): void {
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
    if (this.closed) throw new Error("namespace is closed");
  }
}

/** The miss/fill cycle: walk; on a miss, fire `open` up the chain (deduped
 * per target per requester), await the handlers, re-walk. A re-walk that
 * misses somewhere new means a link was mounted and followed — go again.
 * The same miss twice is NotFound. */
async function resolveWithFills(
  requester: NamespaceImpl,
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
  requester: NamespaceImpl,
  absTarget: string[]
): Promise<void> {
  const calls: Promise<void>[] = [];
  for (let ns: NamespaceImpl | undefined = requester; ns; ns = ns.parent) {
    if (ns.listeners.open.size === 0) continue;
    const target = targetFor(ns, absTarget);
    if (!target) continue;
    const from = new FromView(requester, ns) as unknown as Namespace;
    for (const listener of [...ns.listeners.open]) {
      const out = listener(target, from);
      if (!out || typeof out.then !== "function")
        throw new TypeError("open handler must return a promise");
      calls.push(out);
    }
  }
  await Promise.all(calls);
}

function fireClose(requester: NamespaceImpl, absTarget: string[]): void {
  for (let ns: NamespaceImpl | undefined = requester; ns; ns = ns.parent) {
    if (ns.listeners.close.size === 0) continue;
    const target = targetFor(ns, absTarget);
    if (!target) continue;
    const from = new FromView(requester, ns) as unknown as Namespace;
    for (const listener of [...ns.listeners.close]) listener(target, from);
  }
}

function targetFor(ns: NamespaceImpl, abs: string[]): string[] | undefined {
  if (isUrlRooted(abs)) return abs;
  if (isUrlRooted(ns.pos)) return undefined;
  return startsWith(abs, ns.pos) ? abs.slice(ns.pos.length) : undefined;
}

/** The requester's overlay, seen from a listener's position: paths are
 * translated into the requester's coordinates, so fills land in the
 * requester's overlay and anything opened through it belongs to the
 * requester and closes with it. */
class FromView {
  readonly [brand] = true;

  constructor(
    private readonly requester: NamespaceImpl,
    private readonly listener: NamespaceImpl
  ) {}

  open(path: Path): Promise<NamespaceImpl> {
    const rel = this.rel(path);
    if (rel.length === 0) throw new Error("empty path — use fork()");
    return this.requester.openRel(rel);
  }

  fork(): NamespaceImpl {
    return this.requester.fork();
  }

  mount(path: Path, what: unknown): void {
    this.requester.mount(this.rel(path), what);
  }

  unmount(path: Path): void {
    this.requester.unmount(this.rel(path));
  }

  on(
    event: "change" | "destroy" | "open" | "close",
    fn: (...args: never[]) => unknown
  ): () => void {
    return this.requester.on(event, fn);
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

  private rel(path: Path): string[] {
    const names = parsePath(path);
    if (isUrlRooted(names)) return names;
    if (isUrlRooted(this.listener.pos) || isUrlRooted(this.requester.pos))
      throw new Error("fill outside the requester's subtree");
    const abs = [...this.listener.pos, ...names];
    if (!startsWith(abs, this.requester.pos))
      throw new Error("fill outside the requester's subtree");
    return abs.slice(this.requester.pos.length);
  }
}

/** Live reads: re-walk when any overlay in the chain mutates or any handle
 * the walk crossed fires; `change` fires once the re-walk settles — which
 * may involve the servers, when a retargeted link points somewhere not
 * yet filled. */
class Watch {
  private readonly unsubOverlays: (() => void)[] = [];
  private unsubHandles: (() => void)[] = [];
  private lastTerminal: Handle<unknown> | undefined;
  private generation = 0;
  private handleFired = false;
  private stopped = false;

  constructor(private readonly ns: NamespaceImpl) {
    for (let n: NamespaceImpl | undefined = ns; n; n = n.parent) {
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
        this.ns,
        this.ns.pos
      );
      if (generation !== this.generation || this.stopped) return;
      this.ns.hold(this.ns, requests);
      terminal = result.handle;
    } catch {
      terminal = undefined;
    }
    if (generation !== this.generation || this.stopped) return;
    this.resubscribe(this.safeWalk());
    const changed = fired || terminal !== this.lastTerminal;
    this.lastTerminal = terminal;
    if (changed) this.ns.listeners.change.emit();
  }

  private safeWalk(): WalkResult | undefined {
    try {
      return walk(this.ns, this.ns.pos);
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
      this.unsubHandles.push(handle.on("change", () => this.trigger(true)));
    }
  }
}

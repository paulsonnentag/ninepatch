// a handle is a live grip on a value: read it, write it, hear it change;
// `subscribe` is the store contract, so a handle drops into Solid's `from()`

export const brand: unique symbol = Symbol.for("ninepatch.handle");

export type Handle<T> = {
  readonly [brand]: true;
  readonly value: T;
  set(next: T): void;
  change(fn: (value: T) => void): void;
  /** `fn(value)` now, and after every change. Returns unsubscribe. */
  subscribe(fn: (value: T) => void): () => void;
};

export function isHandle(x: unknown): x is Handle<unknown> {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as Record<PropertyKey, unknown>)[brand] === true
  );
}

/** What `mount` does to a plain value: a mutable handle. */
export function wrap<T>(initial: T): Handle<T> {
  const changes = new Emitter();
  let current = initial;
  return {
    [brand]: true,
    get value() {
      return current;
    },
    set(next: T) {
      current = next;
      changes.emit();
    },
    change(fn: (value: T) => void) {
      fn(current);
      changes.emit();
    },
    subscribe(fn: (value: T) => void) {
      fn(current);
      return changes.on(() => fn(current));
    },
  };
}

/** An automerge DocHandle, structurally — no automerge-repo dependency. */
export type DocHandleLike<T> = {
  doc(): T | undefined;
  change(fn: (doc: T) => void): void;
  on(event: "change", fn: () => void): void;
  off(event: "change", fn: () => void): void;
};

/** A handle over a document; `readOnly` makes set/change throw. */
export function fromDoc<T>(
  handle: DocHandleLike<T>,
  options: { readOnly?: boolean } = {}
): Handle<T> {
  const write = () => {
    if (options.readOnly) throw new Error("read-only handle");
  };
  return {
    [brand]: true,
    get value() {
      return handle.doc() as T;
    },
    set(next: T) {
      write();
      handle.change((doc) => {
        const target = doc as Record<string, unknown>;
        for (const key of Object.keys(target))
          if (!(key in (next as object))) delete target[key];
        Object.assign(target, next);
      });
    },
    change(fn: (value: T) => void) {
      write();
      handle.change(fn);
    },
    subscribe(fn: (value: T) => void) {
      const notify = () => fn(handle.doc() as T);
      notify();
      handle.on("change", notify);
      return () => handle.off("change", notify);
    },
  };
}

/** A field of `source`, read through its value, written through its `change`. */
export function field<T>(source: Handle<unknown>, path: string[]): Handle<T> {
  const read = (value: unknown): T =>
    path.reduce<unknown>(
      (at, key) => (at as Record<string, unknown> | undefined)?.[key],
      value
    ) as T;
  return {
    [brand]: true,
    get value() {
      return read(source.value);
    },
    set(next: T) {
      source.change((draft) => {
        let at = draft as Record<string, unknown>;
        for (const key of path.slice(0, -1))
          at = at[key] as Record<string, unknown>;
        at[path[path.length - 1]] = next;
      });
    },
    change(fn: (value: T) => void) {
      source.change((draft) => fn(read(draft)));
    },
    subscribe(fn: (value: T) => void) {
      return source.subscribe((value) => fn(read(value)));
    },
  };
}

/** Computed from another; `write` makes `set` a two-way lens over the source. */
export function derive<A, B>(
  source: Handle<A>,
  fn: (value: A) => B,
  write?: (next: B) => void
): Handle<B> {
  return {
    [brand]: true,
    get value() {
      return fn(source.value);
    },
    set(next: B) {
      if (!write) throw new Error("read-only handle");
      write(next);
    },
    change() {
      throw new Error("read-only handle");
    },
    subscribe(cb: (value: B) => void) {
      return source.subscribe((value) => cb(fn(value)));
    },
  };
}

/** Read-only, over a getter and the emitter that says when it moved. */
export function readonly<T>(read: () => T, changes: Emitter): Handle<T> {
  return {
    [brand]: true,
    get value() {
      return read();
    },
    set() {
      throw new Error("read-only handle");
    },
    change() {
      throw new Error("read-only handle");
    },
    subscribe(fn: (value: T) => void) {
      fn(read());
      return changes.on(() => fn(read()));
    },
  };
}

/** Changes only: subscribe, minus the synchronous first call. */
export function onChange(handle: Handle<unknown>, fn: () => void): () => void {
  let ready = false;
  const unsubscribe = handle.subscribe(() => {
    if (ready) fn();
  });
  ready = true;
  return unsubscribe;
}

export class Emitter {
  private listeners = new Set<() => void>();
  on(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(): void {
    for (const fn of [...this.listeners]) fn();
  }
  get size(): number {
    return this.listeners.size;
  }
  clear(): void {
    this.listeners.clear();
  }
}

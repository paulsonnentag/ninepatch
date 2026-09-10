/** A handle is a live grip on a value: read it, write it, hear it change.
 * Branded, not duck-typed: things opt in by carrying the symbol, and
 * `mount` checks for it. A DocHandle is the model: `set` replaces,
 * `change` mutates in place, both fire. */

export const brand: unique symbol = Symbol.for("ninepatch.handle");

export type Handle<T> = {
  readonly [brand]: true;
  readonly value: T;
  set(next: T): void;
  change(fn: (value: T) => void): void;
  on(event: "change", fn: () => void): () => void;
};

export function isHandle(x: unknown): x is Handle<unknown> {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as Record<PropertyKey, unknown>)[brand] === true
  );
}

/** What `mount` does to a plain value: a mutable handle of the
 * namespace's own. */
export function wrap<T>(initial: T): Handle<T> {
  const emitter = new Emitter();
  let current = initial;
  return {
    [brand]: true,
    get value() {
      return current;
    },
    set(next: T) {
      current = next;
      emitter.emit();
    },
    change(fn: (value: T) => void) {
      fn(current);
      emitter.emit();
    },
    on(_event: "change", fn: () => void) {
      return emitter.on(fn);
    },
  };
}

/** The structural surface of an automerge DocHandle — core takes it
 * structurally so it has no dependency on automerge-repo. */
export type DocHandleLike<T> = {
  doc(): T | undefined;
  change(fn: (doc: T) => void): void;
  on(event: "change", fn: () => void): void;
  off(event: "change", fn: () => void): void;
};

/** A handle over a document: value ← doc(), change ← change, on ← on/off.
 * `readOnly` makes set/change throw (a pinned `#heads` view). */
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
    on(_event: "change", fn: () => void) {
      handle.on("change", fn);
      return () => handle.off("change", fn);
    },
  };
}

/** A field of `source`, read through its value, written through its
 * `change`. */
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
    on(_event: "change", fn: () => void) {
      return source.on("change", fn);
    },
  };
}

/** A read-only handle computed from another. */
export function derive<A, B>(
  source: Handle<A>,
  fn: (value: A) => B
): Handle<B> {
  return {
    [brand]: true,
    get value() {
      return fn(source.value);
    },
    set() {
      throw new Error("read-only handle");
    },
    change() {
      throw new Error("read-only handle");
    },
    on(_event: "change", cb: () => void) {
      return source.on("change", cb);
    },
  };
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

/** Solid over ninepatch. A tool is a function of one namespace; the DOM is
 * the `dom` entry. `createOpen` is a resource over `ns.open`, `createValue`
 * turns a handle into a signal, `tool` wraps a component, `Mount` is the
 * host side: fork, mount, run, close on cleanup. `createEntries` and
 * `createChildren` are the namespace's own listing as signals, for
 * drawing the tree. */

import {
  createContext,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  useContext,
  type Accessor,
  type JSX,
  type Resource,
} from "solid-js";
import { render } from "solid-js/web";
import {
  NotFound,
  type Entry,
  type Handle,
  type Namespace,
  type Opened,
  type Path,
} from "@ninepatch/core";

export type Tool = (ns: Namespace) => void | Promise<void>;

export function NamespaceProvider(props: {
  ns: Namespace;
  children: JSX.Element;
}) {
  return <Context.Provider value={props.ns}>{props.children}</Context.Provider>;
}

/** The namespace this component was rendered under. */
export function useNamespace(): Namespace {
  const ns = useContext(Context);
  if (!ns) throw new Error("no namespace provided");
  return ns;
}

/** Open a path under the provided namespace. A Solid resource: undefined
 * while opening, NotFound goes to the nearest <ErrorBoundary>, re-opens
 * when `path` is an accessor and changes, closes what it opened on
 * cleanup. */
export function createOpen<T = never>(
  path: Path | Accessor<Path>,
  from: Namespace = useNamespace()
): Resource<Opened<T>> {
  let held: Namespace | undefined;
  const release = () => {
    held?.close();
    held = undefined;
  };
  const [opened] = createResource(
    typeof path === "function" ? path : () => path,
    async (p) => {
      const next = await from.open<T>(p);
      release();
      held = next as Namespace;
      return next;
    }
  );
  onCleanup(release);
  return opened;
}

/** A handle's value as a signal — from a handle, or from a resource of one
 * (undefined until it's open). Every `change` on the handle is a write. */
export function createValue<T>(source: Handle<T>): Accessor<T>;
export function createValue<T>(
  source: Accessor<Handle<T> | undefined>
): Accessor<T | undefined>;
export function createValue<T>(
  source: Handle<T> | Accessor<Handle<T> | undefined>
): Accessor<T | undefined> {
  const handle = typeof source === "function" ? source : () => source;
  const inner = createMemo(() => {
    const h = handle();
    if (!h) return undefined;
    const [get, set] = createSignal<T | undefined>(read(h), { equals: false });
    onCleanup(h.on("change", () => set(() => read(h))));
    return get;
  });
  return () => inner()?.();
}

/** A Tool from a component: opens `dom`, renders into it under the
 * namespace, disposes on destroy. */
export function tool(Component: () => JSX.Element): Tool {
  return async (ns) => {
    let dom: Opened<Element>;
    try {
      dom = await ns.open<Element>("dom");
    } catch (e) {
      if (
        e instanceof NotFound ||
        (e as Error).message === "namespace is closed"
      )
        return;
      throw e;
    }
    const dispose = render(
      () => <Context.Provider value={ns}>{<Component />}</Context.Provider>,
      dom.value
    );
    ns.on("destroy", dispose);
  };
}

/** Host side: a slot that forks the provided namespace (under `name`),
 * mounts `mount` plus its own element as `dom`, runs the tool, closes on
 * cleanup. */
export function Mount(props: {
  tool: Tool;
  name?: string;
  mount?: Record<string, unknown>;
  unmount?: string[];
  class?: string;
}) {
  const ns = useNamespace().fork(props.name);
  const el = (
    <div class={["tool", props.class].filter(Boolean).join(" ")} />
  ) as HTMLDivElement;
  for (const [path, what] of Object.entries(props.mount ?? {}))
    ns.mount(path, what);
  for (const path of props.unmount ?? []) ns.unmount(path);
  ns.mount("dom", el);
  void props.tool(ns);
  onCleanup(() => ns.close());
  return el;
}

/** A namespace's own overlay as a signal; re-reads on `mutated`. */
export function createEntries(ns: Namespace): Accessor<Entry[]> {
  return createMutated(ns, () => ns.entries());
}

/** A namespace's live children as a signal; re-reads on `mutated`. */
export function createChildren(ns: Namespace): Accessor<Namespace[]> {
  return createMutated(ns, () => [...ns.children]);
}

const Context = createContext<Namespace>();

function createMutated<T>(ns: Namespace, get: () => T): Accessor<T> {
  const [value, set] = createSignal(get(), { equals: false });
  onCleanup(ns.on("mutated", () => set(() => get())));
  return value;
}

function read<T>(h: Handle<T>): T | undefined {
  try {
    return h.value;
  } catch (e) {
    if (e instanceof NotFound) return undefined;
    throw e;
  }
}

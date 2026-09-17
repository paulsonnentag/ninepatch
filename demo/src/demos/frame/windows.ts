import { createSignal, type Accessor } from "solid-js";
import { field, type Directory, type Handle } from "@ninepatch/core";
import type { Selection, Surfaces, Workspace } from "../../types";
import { viewOf } from "./describe";

export const NOTHING: Selection = { document: "", view: "" };

// the workspace as a manager sees it: each part by field, live, plus the
// view each document was asked for, so a window mounts from `open` alone
export function manage(dir: Directory, workspace: Handle<Workspace>) {
  const selected = field<Selection>(workspace, ["selected"]);
  const open = field<string[]>(workspace, ["open"]);
  const surfaces = field<Surfaces>(workspace, ["surfaces"]);
  const views = new Map<string, string>();
  let published = "";

  const select = (document: string) =>
    selected.set(
      document ? { document, view: views.get(document) ?? "" } : NOTHING
    );

  return {
    selected: live(selected, dir.signal),
    open: live(open, dir.signal),
    select,
    // remember how it was asked for; add it to `open` if it isn't there
    ensureOpen(s: Selection) {
      if (s.view) views.set(s.document, s.view);
      if (s.document && !open.value.includes(s.document))
        open.set([...open.value, s.document]);
    },
    // put it in slot `at` of `open`, in place of what was there; that one
    // is returned, so the manager can hand its place over
    openIn(s: Selection, at: number): string | undefined {
      if (s.view) views.set(s.document, s.view);
      const rest = open.value.filter((d) => d !== s.document);
      const replaced = rest[at];
      rest.splice(at, 1, s.document);
      open.set(rest);
      return replaced;
    },
    // close one, and hand focus to `next` if it was the focused one
    close(document: string, next: (rest: string[]) => string | undefined) {
      const rest = open.value.filter((d) => d !== document);
      open.set(rest);
      if (selected.value.document === document) select(next(rest) ?? "");
    },
    mount(document: string, el: Element): Directory {
      return mountWindow(dir, document, el, views.get(document));
    },
    // tell the sidebar where things could go, in this manager's words
    publish(next: Surfaces) {
      const json = JSON.stringify(next);
      if (json === published) return;
      published = json;
      surfaces.set(next);
    },
  };
}

// a handle as a signal that only fires when the value is a new one: every
// write to the workspace wakes every field, and a field that didn't change
// must not re-run what reacts to it
export function live<T>(handle: Handle<T>, until: AbortSignal): Accessor<T> {
  const [get, set] = createSignal(handle.value);
  const unsubscribe = handle.subscribe((v) => set(() => v));
  until.addEventListener("abort", unsubscribe);
  return get;
}

/** The slot a target like `tab 3` names: 2; `undefined` if it isn't one. */
export function slotOf(
  target: string | undefined,
  kind: string
): number | undefined {
  const match = target?.match(new RegExp(`^${kind} (\\d+)$`));
  return match ? Number(match[1]) - 1 : undefined;
}

// a window's whole world: its element and its document; the workspace
// falls through from above. Shown by `view`, or by what the document is
export function mountWindow(
  dir: Directory,
  document: string,
  el: Element,
  view?: string
): Directory {
  const child = dir.fork(document);
  child.mount("dom", el);
  child.mount("document", document);
  const chosen = view
    ? Promise.resolve(view)
    : child.open<{ type?: string }>("document").then((d) => {
        const v = viewOf(d.value);
        d.close();
        return v;
      });
  chosen
    .then((v) => child.spawn(componentName(v), v).terminated)
    .catch((e: unknown) => {
      if (!child.signal.aborted) el.textContent = String(e);
    });
  return child;
}

export function componentName(url: string): string {
  const base = url
    .split("/")
    .pop()!
    .replace(/\.tsx?$/, "");
  return base[0].toUpperCase() + base.slice(1);
}

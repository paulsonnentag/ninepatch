/** The page furniture: the host side of a tool (`Mount`), and a section —
 * prose plus three panels: the live example, the code behind it in tabs,
 * and the directories it runs in, drawn as a file window: the hierarchy
 * of directories as windows with their entries as files, and a preview of
 * whatever is selected. Handles feed Solid through
 * `from()`: a handle is a store. */

import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  ErrorBoundary,
  For,
  from,
  onCleanup,
  Show,
  type Accessor,
  type JSX,
} from "solid-js";
import { hasScheme, type Handle, type Directory } from "@ninepatch/core";
import { javascript } from "@codemirror/lang-javascript";
import { classHighlighter, highlightTree } from "@lezer/highlight";
import { render } from "solid-js/web";
import { RawEditor } from "./raw-editor";
import type { Tool } from "./types";

export type Source = { name: string; code: string };

/** The host side of a tool, spelled out: fork the section's directory
 * under `name`, mount what the tool should see plus this element as
 * `dom`, run it, close on cleanup. A tool that rejects — an entry it
 * needed isn't there — says so in its slot. */
export function Mount(props: {
  dir: Directory;
  name: string;
  tool: Tool;
  mount?: Record<string, unknown>;
  unmount?: string[];
}) {
  const dir = props.dir.fork(props.name);
  const el = (<div class="tool" />) as HTMLDivElement;
  for (const [path, what] of Object.entries(props.mount ?? {}))
    dir.mount(path, what);
  for (const path of props.unmount ?? []) dir.unmount(path);
  dir.mount("dom", el);
  props.tool(dir).catch((e: unknown) => {
    if (!dir.signal.aborted) el.textContent = String(e);
  });
  onCleanup(() => dir.close());
  return el;
}

/** A section: title and prose at reading width, then a band across the
 * whole page — preview | code | data — with draggable dividers between
 * the three and a resize grip for its height. */
export function Section(props: {
  title: string;
  prose: JSX.Element;
  sources: Source[];
  /** The section's directory, last, with everything it was forked from
   * before it — that's where its inherited entries come from. */
  chain: Directory[];
  children: JSX.Element;
}) {
  const [widths, setWidths] = createSignal([1, 1, 1]);
  let band!: HTMLDivElement;

  /** Drag a divider: move width between its two neighbours, in fractions
   * of the band, so the layout survives a window resize. */
  const drag = (index: number, e: PointerEvent) => {
    e.preventDefault();
    const start = e.clientX;
    const before = widths();
    const total = before.reduce((a, b) => a + b, 0);
    const px = band.getBoundingClientRect().width;
    const min = 0.15 * total;
    const move = (ev: PointerEvent) => {
      const wanted = ((ev.clientX - start) / px) * total;
      const delta = Math.max(
        min - before[index],
        Math.min(before[index + 1] - min, wanted)
      );
      const next = [...before];
      next[index] = before[index] + delta;
      next[index + 1] = before[index + 1] - delta;
      setWidths(next);
    };
    const stop = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", stop);
      document.body.classList.remove("dragging");
    };
    document.body.classList.add("dragging");
    addEventListener("pointermove", move);
    addEventListener("pointerup", stop);
  };

  return (
    <section>
      <h2>{props.title}</h2>
      <div class="prose">{props.prose}</div>
      <div
        class="panels"
        ref={band}
        style={{
          "grid-template-columns": widths()
            .map((w) => `minmax(0, ${w}fr)`)
            .join(" 1px "),
        }}
      >
        <div class="panel example">
          <h3>preview</h3>
          <div class="panel-body live">{props.children}</div>
        </div>
        <div class="divider" onPointerDown={[drag, 0]} />
        <div class="panel code">
          <h3>code</h3>
          <div class="panel-body">
            <Tabs sources={props.sources} />
          </div>
        </div>
        <div class="divider" onPointerDown={[drag, 1]} />
        <div class="panel context">
          <h3>data</h3>
          <div class="panel-body">
            <Windows chain={props.chain} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Tabs(props: { sources: Source[] }) {
  const [active, setActive] = createSignal(0);
  return (
    <>
      <div class="tabs" role="tablist">
        <For each={props.sources}>
          {(source, i) => (
            <button
              role="tab"
              class="tab"
              classList={{ active: active() === i() }}
              onClick={() => setActive(i())}
            >
              {source.name}
            </button>
          )}
        </For>
      </div>
      <pre class="source">
        <code>{highlight(props.sources[active()]?.code ?? "")}</code>
      </pre>
    </>
  );
}

/** Syntax colours from the same parser CodeMirror uses, as static spans:
 * `tok-*` classes, styled in the stylesheet. */
function highlight(code: string): JSX.Element[] {
  const tree = javascript({
    jsx: true,
    typescript: true,
  }).language.parser.parse(code);
  const out: JSX.Element[] = [];
  let at = 0;
  highlightTree(tree, classHighlighter, (from, to, classes) => {
    if (from > at) out.push(code.slice(at, from));
    out.push(<span class={classes}>{code.slice(from, to)}</span>);
    at = to;
  });
  if (at < code.length) out.push(code.slice(at));
  return out;
}

// --- the windows --------------------------------------------------------------

type EntryRow = {
  key: string;
  path: string[];
  handle: Handle<unknown>;
  /** Whose overlay it sits in: this directory, or one it inherits from. */
  owner: Directory;
  inherited: boolean;
};

/** An entry picked in some window: the row, the directory whose window it
 * was picked in, and that window's probe for resolving links. */
type Selection = {
  row: EntryRow;
  dir: Directory;
  probe: Directory | undefined;
};

/** How a window is found from elsewhere — the preview's "from" link
 * unfolds the window the entry came from and scrolls to it. */
type Registry = Map<Directory, () => void>;

/** The directories of a section: one window per directory, hung in their
 * hierarchy. Selecting an entry opens a preview inside its window. */
function Windows(props: { chain: Directory[] }) {
  const [selected, setSelected] = createSignal<Selection>();
  const registry: Registry = new Map();
  mountHighlight();
  return (
    <div class="windows" role="tree">
      <Node
        chain={props.chain}
        depth={0}
        selected={selected()}
        onSelect={setSelected}
        registry={registry}
      />
    </div>
  );
}

/** One directory in the tree: a window named after it, listing what
 * `open` would find from here — what it inherits from the directories it
 * was forked from, faint, then its own — and below it the directories below
 * it, each its own window hanging off a line from this one. A directory
 * that mounted nothing of its own is transparent to reads, so it is
 * transparent here too: not drawn, its children in its place (the top one
 * is kept as long as it has anything to list). The viewer's
 * own opens (to show what a link points at) go through a fork made before
 * it starts listening, so they never show up as windows. What is selected
 * in this window is previewed beside its list. */
function Node(props: {
  chain: Directory[];
  depth: number;
  selected: Selection | undefined;
  onSelect: (sel: Selection | undefined) => void;
  registry: Registry;
}) {
  const self = props.chain[props.chain.length - 1];
  const probe = tryFork(self);
  onCleanup(() => probe?.close());
  const rows = createRows(props.chain);
  const own = () => rows().filter((row) => !row.inherited);
  const kids = from(self.children, self.children.value);
  const children = () => kids().filter((c) => c !== probe);
  /** Nothing to show: below the top, a directory that mounted nothing;
   * at the top, one with nothing to list at all. */
  const transparent = () =>
    props.depth > 0 ? own().length === 0 : rows().length === 0;
  const [folded, setFolded] = createSignal(false);
  const [height, setHeight] = createSignal(250);
  let el!: HTMLDivElement;

  /** Drag the bottom edge: the window gets taller or shorter, never
   * shorter than its title bar and a few rows. */
  const resize = (e: PointerEvent) => {
    e.preventDefault();
    const start = e.clientY;
    const before = height();
    const move = (ev: PointerEvent) =>
      setHeight(Math.max(96, before + ev.clientY - start));
    const stop = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", stop);
      document.body.classList.remove("resizing");
    };
    document.body.classList.add("resizing");
    addEventListener("pointermove", move);
    addEventListener("pointerup", stop);
  };

  const isSelected = (row: EntryRow) =>
    props.selected?.dir === self && props.selected.row.key === row.key;
  /** This row is where a selection somewhere below was inherited from. */
  const isOrigin = (row: EntryRow) =>
    props.selected !== undefined &&
    props.selected.dir !== self &&
    props.selected.row.owner === self &&
    props.selected.row.key === row.key;
  /** The selection, if it is in this window. */
  const mine = () =>
    props.selected?.dir === self ? props.selected : undefined;

  props.registry.set(self, () => {
    setFolded(false);
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
  onCleanup(() => props.registry.delete(self));

  // a selection that no longer exists — the entry went, or this directory
  // closed — is dropped
  createEffect(() => {
    const sel = props.selected;
    if (sel?.dir === self) {
      const row = rows().find((r) => r.key === sel.row.key);
      if (!row) props.onSelect(undefined);
      else if (row !== sel.row) props.onSelect({ ...sel, row });
    }
  });
  onCleanup(() => {
    if (props.selected?.dir === self) props.onSelect(undefined);
  });

  const below = () => (
    <For each={children()}>
      {(child) => (
        <Node
          chain={[...props.chain, child]}
          depth={transparent() ? props.depth : props.depth + 1}
          selected={props.selected}
          onSelect={props.onSelect}
          registry={props.registry}
        />
      )}
    </For>
  );

  return (
    <Show when={!transparent()} fallback={below()}>
      <div class="folder-node">
        <div
          class="window"
          classList={{ open: mine() !== undefined, folded: folded() }}
          style={{ "--height": `${height()}px` }}
          ref={el}
        >
          <div class="titlebar" title={self.name}>
            <span class="window-title">{label(self.name)}</span>
            <button
              class="fold"
              title={folded() ? "expand" : "minimize"}
              aria-expanded={!folded()}
              onClick={() => setFolded(!folded())}
            >
              <FoldIcon folded={folded()} />
            </button>
          </div>
          <Show when={!folded()}>
            <div class="window-body">
              <div class="entries">
                <For each={rows()}>
                  {(row) => (
                    <div
                      class="tree-item"
                      classList={{
                        selected: isSelected(row),
                        origin: isOrigin(row),
                        inherited: row.inherited,
                      }}
                      title={
                        row.inherited
                          ? `from ${row.owner.name}`
                          : `mounted here`
                      }
                      onClick={() => props.onSelect({ row, dir: self, probe })}
                    >
                      <FileIcon />
                      <span class="tree-name">{row.path.join("/")}</span>
                      <span class="tree-value">
                        <Value
                          handle={row.handle}
                          path={row.path}
                          probe={probe}
                        />
                      </span>
                    </div>
                  )}
                </For>
              </div>
              <Show when={mine()} keyed>
                {(sel) => (
                  <Preview
                    selection={sel}
                    reveal={(dir) => props.registry.get(dir)?.()}
                    close={() => props.onSelect(undefined)}
                  />
                )}
              </Show>
            </div>
            <div class="window-grip" onPointerDown={resize} />
          </Show>
        </div>
        <div class="folder-children">{below()}</div>
      </div>
    </Show>
  );
}

/** The selected entry, in full: where it came from, if inherited — click
 * the name to go to that window — and its value: a link as the document it points at
 * with the URL above, copyable; an element as its DOM tree; anything else
 * in the raw editor. */
function Preview(props: {
  selection: Selection;
  reveal: (dir: Directory) => void;
  close: () => void;
}) {
  const { row, probe } = props.selection;
  return (
    <div class="preview">
      <div class="preview-head">
        <FileIcon />
        <code class="preview-path">{row.path.join("/")}</code>
        <Show when={row.inherited}>
          <span class="preview-where">
            from{" "}
            <button
              class="preview-from"
              onClick={() => props.reveal(row.owner)}
            >
              {label(row.owner.name)}
            </button>
          </span>
        </Show>
        <button class="preview-close" title="close" onClick={props.close}>
          <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
          </svg>
        </button>
      </div>
      <div class="preview-body">
        <Value handle={row.handle} path={row.path} probe={probe} editor />
      </div>
    </div>
  );
}

/** Minimize (a bar) or expand (a bar and a post: a plus). */
function FoldIcon(props: { folded: boolean }) {
  return (
    <svg class="icon fold-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8h9" />
      <Show when={props.folded}>
        <path d="M8 3.5v9" />
      </Show>
    </svg>
  );
}

function FileIcon() {
  return (
    <svg class="icon file-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        class="page"
        d="M3.5 1.5h6l3 3v9.5a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1-.5-.5v-12a.5.5 0 0 1 .5-.5z"
      />
      <path class="corner" d="M9.5 1.5v3h3" />
    </svg>
  );
}

/** What a value looks like: a one-line summary in a row, or, with
 * `editor`, the full thing. A link is drawn as what it points at — the URL
 * itself appears above the editor, copyable — by opening it through the
 * probe so the document follows the link live. An element has no summary;
 * its editor is its DOM tree. */
function Value(props: {
  handle: Handle<unknown>;
  path: string[];
  probe: Directory | undefined;
  editor?: boolean;
}) {
  const value = from(props.handle, readValue(props.handle));
  const isLink = () =>
    typeof value() === "string" && hasScheme(value() as string);
  const isElement = () => value() instanceof Element;
  return (
    <Show
      when={isLink() && props.probe}
      fallback={
        <Show
          when={isElement()}
          fallback={
            <Show when={props.editor} fallback={<Summary value={value()} />}>
              <RawEditor handle={props.handle} />
            </Show>
          }
        >
          <Show when={props.editor}>
            <DomTree element={value() as Element} />
          </Show>
        </Show>
      }
    >
      <ErrorBoundary
        fallback={(e) => (
          <span class="unresolved" title={String(e)}>
            <code class="url">{shorten(value() as string)}</code> →{" "}
            <i>{(e as Error).name === "NotFound" ? "not found" : String(e)}</i>
          </span>
        )}
      >
        <Linked
          url={value() as string}
          path={props.path}
          probe={props.probe!}
          editor={props.editor}
        />
      </ErrorBoundary>
    </Show>
  );
}

/** Opens the path through the probe — a resource, so NotFound reaches the
 * <ErrorBoundary> above — and closes what it opened when the row goes. */
function Linked(props: {
  url: string;
  path: string[];
  probe: Directory;
  editor?: boolean;
}) {
  let held: Directory | undefined;
  const [opened] = createResource(
    async () => (held = await props.probe.open<unknown>(props.path))
  );
  onCleanup(() => held?.close());
  return (
    <Show when={opened()} fallback={<i class="loading">…</i>}>
      {(target) => {
        const value = from(target(), readValue(target()));
        return (
          <Show when={props.editor} fallback={<Summary value={value()} />}>
            <CopyUrl url={props.url} />
            <RawEditor handle={target()} />
          </Show>
        );
      }}
    </Show>
  );
}

function CopyUrl(props: { url: string }) {
  const [copied, setCopied] = createSignal(false);
  return (
    <button
      class="copy-url"
      classList={{ copied: copied() }}
      title="click to copy"
      onClick={() => {
        void navigator.clipboard?.writeText(props.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      <code class="url">{copied() ? "copied" : props.url}</code>
    </button>
  );
}

/** A one-line reading of a value: what kind of thing it is, not what it
 * says. Links by URL, objects by their keys. */
function Summary(props: { value: unknown }) {
  return <>{summarize(props.value)}</>;
}

function summarize(v: unknown): JSX.Element {
  if (v === undefined) return <i>—</i>;
  if (v === null) return <code>null</code>;
  if (typeof v === "string")
    return hasScheme(v) ? (
      <code class="url" title={v}>
        {shorten(v)}
      </code>
    ) : (
      <code>{JSON.stringify(v)}</code>
    );
  if (typeof v === "function") return <code>fn</code>;
  if (Array.isArray(v))
    return (
      <code>
        [{v.length} {v.length === 1 ? "item" : "items"}]
      </code>
    );
  if (typeof v === "object") {
    const keys = Object.keys(v);
    const shown = keys.slice(0, 4).join(", ");
    const more = keys.length > 4 ? `, +${keys.length - 4}` : "";
    return <code>{`{ ${shown}${more} }`}</code>;
  }
  return <code>{String(v)}</code>;
}

// --- the dom tree -------------------------------------------------------------

const MAX_DOM_NODES = 400;

/** An element as the inspector would show it: every descendant, nested,
 * tags with their attributes and text in between, redrawn as the element
 * changes. Hovering a line lights up that element in the page. */
function DomTree(props: { element: Element }) {
  const [version, bump] = createSignal(0, { equals: false });
  const observer = new MutationObserver(() => bump(0));
  observer.observe(props.element, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });
  onCleanup(() => observer.disconnect());
  const lines = createMemo(() => {
    version();
    const out: DomLine[] = [];
    flatten(props.element, 0, out);
    return out;
  });
  return (
    <div class="dom-tree">
      <For each={lines()}>{(line) => renderLine(line)}</For>
    </div>
  );
}

function renderLine(line: DomLine): JSX.Element {
  const style = { "--depth": line.depth };
  if (line.kind === "text" || line.kind === "more")
    return (
      <div
        class="dom-line"
        classList={{ "dom-more": line.kind === "more" }}
        style={style}
      >
        <span class="dom-text">{line.text}</span>
      </div>
    );
  const hover = {
    onMouseEnter: () => setLit(line.element),
    onMouseLeave: () => setLit(undefined),
  };
  if (line.kind === "close")
    return (
      <div class="dom-line" style={style} {...hover}>
        {"</"}
        <span class="dom-tag">{line.tag}</span>
        {">"}
      </div>
    );
  return (
    <div class="dom-line" style={style} {...hover}>
      {"<"}
      <span class="dom-tag">{line.tag}</span>
      <For each={line.attrs}>
        {(a) => (
          <>
            {" "}
            <span class="dom-attr">{a.name}</span>
            <Show when={a.value !== ""}>
              =<span class="dom-value">"{a.value}"</span>
            </Show>
          </>
        )}
      </For>
      {line.empty ? " />" : ">"}
    </div>
  );
}

type DomLine =
  | {
      kind: "open";
      depth: number;
      element: Element;
      tag: string;
      attrs: { name: string; value: string }[];
      empty: boolean;
    }
  | { kind: "close"; depth: number; element: Element; tag: string }
  | { kind: "text"; depth: number; text: string }
  | { kind: "more"; depth: number; text: string };

function flatten(el: Element, depth: number, out: DomLine[]): void {
  if (out.length >= MAX_DOM_NODES) {
    if (out[out.length - 1]?.kind !== "more")
      out.push({ kind: "more", depth, text: "…" });
    return;
  }
  const tag = el.tagName.toLowerCase();
  const attrs = [...el.attributes].map((a) => ({
    name: a.name,
    value: a.value.length > 60 ? `${a.value.slice(0, 57)}…` : a.value,
  }));
  const kids = [...el.childNodes].filter(
    (n) => n instanceof Element || n.textContent?.trim()
  );
  out.push({
    kind: "open",
    depth,
    element: el,
    tag,
    attrs,
    empty: !kids.length,
  });
  if (!kids.length) return;
  for (const kid of kids) {
    if (kid instanceof Element) flatten(kid, depth + 1, out);
    else {
      const text = kid.textContent!.trim();
      out.push({
        kind: "text",
        depth: depth + 1,
        text: text.length > 80 ? `${text.slice(0, 77)}…` : text,
      });
    }
  }
  out.push({ kind: "close", depth, element: el, tag });
}

/** The element under the mouse in a DOM tree, and a box drawn over it in
 * the page — one box for the whole page, mounted on first use. */
const [lit, setLit] = createSignal<Element>();
let highlightMounted = false;

function mountHighlight() {
  if (highlightMounted) return;
  highlightMounted = true;
  render(() => <Highlight />, document.body);
}

function Highlight() {
  const rect = () => {
    const el = lit();
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  };
  return (
    <Show when={rect()}>
      {(r) => (
        <div
          class="dom-highlight"
          style={{
            top: `${r().top}px`,
            left: `${r().left}px`,
            width: `${r().width}px`,
            height: `${r().height}px`,
          }}
        />
      )}
    </Show>
  );
}

// --- helpers ------------------------------------------------------------------

/** The rows of a column: what a walk from the last directory in the chain
 * would find, inherited entries first and the directory's own after them.
 * Resolved nearest overlay first: a path already seen is shadowed, a cut
 * hides everything at or below it from further out. URL-keyed fills are
 * the plumbing, not the picture. Row identity is kept per path so a
 * fill landing elsewhere doesn't rebuild every row. */
function createRows(chain: Directory[]): Accessor<EntryRow[]> {
  const layers = [...chain]
    .reverse()
    .map((dir) => ({ dir, entries: from(dir.entries, dir.entries.value) }));
  let cache = new Map<string, EntryRow>();
  return createMemo(() => {
    const next = new Map<string, EntryRow>();
    const rows: EntryRow[] = [];
    const seen = new Set<string>();
    const cuts: string[][] = [];
    layers.forEach(({ dir, entries }, depth) => {
      for (const entry of entries()) {
        if (hasScheme(entry.path[0])) continue;
        const key = entry.path.join("/");
        if (seen.has(key) || cuts.some((cut) => under(entry.path, cut)))
          continue;
        seen.add(key);
        if (!entry.handle) {
          cuts.push(entry.path);
          continue;
        }
        const prev = cache.get(key);
        const row: EntryRow =
          prev && prev.handle === entry.handle && prev.owner === dir
            ? prev
            : {
                key,
                path: entry.path,
                handle: entry.handle,
                owner: dir,
                inherited: depth > 0,
              };
        next.set(key, row);
        rows.push(row);
      }
    });
    cache = next;
    return [
      ...rows.filter((row) => row.inherited),
      ...rows.filter((row) => !row.inherited),
    ];
  });
}

function under(path: string[], prefix: string[]): boolean {
  return (
    path.length >= prefix.length && prefix.every((name, i) => path[i] === name)
  );
}

function tryFork(dir: Directory): Directory | undefined {
  try {
    return dir.fork("inspector");
  } catch {
    return undefined; // already closed; the column is on its way out
  }
}

function readValue(handle: Handle<unknown>): unknown {
  try {
    return handle.value;
  } catch {
    return undefined;
  }
}

function label(name: string): string {
  return name.split("/").map(shorten).join("/");
}

/** `automerge:4NMNnkMh…` — a URL keeps its scheme and a few characters of
 * its id; anything else is shown whole. */
function shorten(name: string): string {
  if (!hasScheme(name) || name.length <= 22) return name;
  const colon = name.indexOf(":");
  return `${name.slice(0, colon + 1)}${name.slice(colon + 1, colon + 9)}…`;
}

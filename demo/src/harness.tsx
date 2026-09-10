/** The page furniture: a section is prose plus three panels — the live
 * example, the code behind it in tabs, and the namespaces it runs in,
 * drawn as a tree with a table per node. */

import {
  createMemo,
  createSignal,
  ErrorBoundary,
  For,
  onCleanup,
  Show,
  type Accessor,
  type JSX,
} from "solid-js";
import {
  hasScheme,
  type Entry,
  type Handle,
  type Namespace,
} from "@ninepatch/core";
import {
  createChildren,
  createEntries,
  createOpen,
  createValue,
} from "@ninepatch/solid";
import { javascript } from "@codemirror/lang-javascript";
import { classHighlighter, highlightTree } from "@lezer/highlight";
import { RawEditor } from "./raw-editor";

export type Source = { name: string; code: string };

/** A section: title and prose at reading width, then a band across the
 * whole page — preview | code | namespace — with draggable dividers between
 * the three and a resize grip for its height. */
export function Section(props: {
  title: string;
  prose: JSX.Element;
  sources: Source[];
  context: Namespace;
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
            .join(" 7px "),
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
          <h3>namespace</h3>
          <div class="panel-body">
            <ContextTree ns={props.context} />
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

// --- the tree -----------------------------------------------------------------

/** One namespace: its name, its own entries as a table, its children below.
 * A namespace that changed nothing — no mounts of its own — is transparent
 * to reads, so it's transparent here too: it isn't drawn, and its children
 * take its place. Only the root is always drawn. The viewer's own opens (to
 * show what a link points at) go through a fork made before it starts
 * listening, so they never appear in the picture. */
function ContextTree(props: { ns: Namespace; depth?: number }) {
  const depth = props.depth ?? 0;
  const probe = tryFork(props.ns);
  onCleanup(() => probe?.close());
  const entries = createStableEntries(props.ns);
  const all = createChildren(props.ns);
  const children = () => all().filter((c) => c !== probe);
  const transparent = () => depth > 0 && entries().length === 0;
  const label = () => props.ns.name.split("/").map(shorten).join("/");

  const below = () => (
    <For each={children()}>
      {(child) => <ContextTree ns={child} depth={depth + 1} />}
    </For>
  );

  return (
    <Show when={!transparent()} fallback={below()}>
      <details class="node" open={depth < 2}>
        <summary>
          <span class="node-name" title={props.ns.name}>
            {label()}
          </span>
        </summary>
        <Show when={entries().length > 0}>
          <table class="entries">
            <tbody>
              <For each={entries()}>
                {(entry) => (
                  <EntryRow entry={entry} ns={props.ns} probe={probe} />
                )}
              </For>
            </tbody>
          </table>
        </Show>
        <div class="node-children">{below()}</div>
      </details>
    </Show>
  );
}

/** A row per entry: the path, and the value — collapsed to a one-line
 * summary until focus lands in it, then the editor underneath. */
function EntryRow(props: {
  entry: Entry;
  ns: Namespace;
  probe: Namespace | undefined;
}) {
  const [expanded, setExpanded] = createSignal(false);
  const handle = props.entry.handle;
  const expandable = () =>
    handle !== undefined && !(readValue(handle) instanceof Element);
  let cell!: HTMLTableCellElement;
  let editor: HTMLTableCellElement | undefined;
  const inside = (el: EventTarget | null) =>
    el instanceof Node && (cell.contains(el) || !!editor?.contains(el));

  return (
    <>
      <tr classList={{ cut: !handle, expanded: expanded() }}>
        <td class="entry-path" title={props.entry.path.join("/")}>
          <For each={props.entry.path}>
            {(name, i) => (
              <>
                <Show when={i() > 0}>/</Show>
                <span classList={{ url: hasScheme(name) }}>
                  {shorten(name)}
                </span>
              </>
            )}
          </For>
        </td>
        <td
          class="entry-value"
          classList={{ expandable: expandable() }}
          ref={cell}
          tabindex={expandable() ? 0 : undefined}
          onFocusIn={() => expandable() && setExpanded(true)}
          onFocusOut={(e) => !inside(e.relatedTarget) && setExpanded(false)}
        >
          <Show when={handle} fallback={<i>cut</i>}>
            <Value
              handle={handle!}
              path={props.entry.path}
              probe={props.probe}
              expanded={expanded()}
              slot="summary"
            />
          </Show>
        </td>
      </tr>
      <Show when={expanded() && handle}>
        <tr class="entry-editor">
          <td
            colspan={2}
            tabindex={-1}
            ref={editor}
            onFocusOut={(e) => !inside(e.relatedTarget) && setExpanded(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && e.target === e.currentTarget)
                e.currentTarget.blur();
            }}
          >
            <Value
              handle={handle!}
              path={props.entry.path}
              probe={props.probe}
              expanded={expanded()}
              slot="editor"
            />
          </td>
        </tr>
      </Show>
    </>
  );
}

/** What a value looks like, in two slots: the summary line, and the editor
 * shown under it once expanded. A link is drawn as what it points at — the
 * URL itself appears above the editor, copyable — by opening it through
 * the probe so the document follows the link live. */
function Value(props: {
  handle: Handle<unknown>;
  path: string[];
  probe: Namespace | undefined;
  expanded: boolean;
  slot: "summary" | "editor";
}) {
  const value = createValue(props.handle);
  const isLink = () =>
    typeof value() === "string" && hasScheme(value() as string);
  return (
    <Show
      when={isLink() && props.probe}
      fallback={
        <Show
          when={props.slot === "editor"}
          fallback={<Summary value={value()} />}
        >
          <RawEditor handle={props.handle} />
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
          slot={props.slot}
        />
      </ErrorBoundary>
    </Show>
  );
}

function Linked(props: {
  url: string;
  path: string[];
  probe: Namespace;
  slot: "summary" | "editor";
}) {
  const opened = createOpen<unknown>(props.path, props.probe);
  const target = createValue(opened);
  return (
    <Show when={opened()} fallback={<i class="loading">…</i>}>
      <Show
        when={props.slot === "editor"}
        fallback={<Summary value={target()} />}
      >
        <CopyUrl url={props.url} />
        <RawEditor handle={opened()!} />
      </Show>
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
 * says. Elements by tag, links by URL, objects by their keys. */
function Summary(props: { value: unknown }) {
  return <>{summarize(props.value)}</>;
}

function summarize(v: unknown): JSX.Element {
  if (v === undefined) return <i>—</i>;
  if (v === null) return <code>null</code>;
  if (v instanceof Element) return <DomSummary element={v} />;
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

/** A DOM element as its own markup — the opening tag with every attribute,
 * `…` for whatever is inside, the closing tag — on one line, cut with an
 * ellipsis when it spills. Hovering it lights up the element in the page. */
function DomSummary(props: { element: Element }) {
  const el = () => props.element;
  const tag = () => el().tagName.toLowerCase();
  const read = () => ({
    attrs: [...el().attributes]
      .map((a) => ({
        name: a.name,
        value:
          a.name === "class"
            ? a.value.replace(/\bns-highlight\b/, "").trim()
            : a.value,
      }))
      .filter((a) => a.name !== "class" || a.value !== ""),
    filled: el().childNodes.length > 0,
  });
  const [shape, setShape] = createSignal(read());
  const observer = new MutationObserver(() => setShape(read()));
  observer.observe(el(), { attributes: true, childList: true });
  onCleanup(() => observer.disconnect());
  const attrs = () => shape().attrs;
  const light = (on: boolean) => el().classList.toggle("ns-highlight", on);
  onCleanup(() => light(false));
  return (
    <code
      class="dom"
      title={el().outerHTML.slice(0, 400)}
      onMouseEnter={() => light(true)}
      onMouseLeave={() => light(false)}
    >
      {"<"}
      <span class="dom-tag">{tag()}</span>
      <For each={attrs()}>
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
      {">"}
      <Show when={shape().filled}>…</Show>
      {"</"}
      <span class="dom-tag">{tag()}</span>
      {">"}
    </code>
  );
}

// --- helpers ------------------------------------------------------------------

/** The namespace's path entries — URL-keyed fills are the plumbing, not
 * the picture — with row identity kept per path, so a fill landing
 * elsewhere in the overlay doesn't rebuild every row. */
function createStableEntries(ns: Namespace): Accessor<Entry[]> {
  const raw = createEntries(ns);
  let cache = new Map<string, Entry>();
  return createMemo(() => {
    const next = new Map<string, Entry>();
    const out: Entry[] = [];
    for (const entry of raw()) {
      if (hasScheme(entry.path[0])) continue;
      const key = entry.path.join("/");
      const prev = cache.get(key);
      const kept = prev && prev.handle === entry.handle ? prev : entry;
      next.set(key, kept);
      out.push(kept);
    }
    cache = next;
    return out;
  });
}

function tryFork(ns: Namespace): Namespace | undefined {
  try {
    return ns.fork("inspector");
  } catch {
    return undefined; // already closed; the row is on its way out
  }
}

function readValue(handle: Handle<unknown>): unknown {
  try {
    return handle.value;
  } catch {
    return undefined;
  }
}

/** `automerge:4NMNnkMh…` — a URL keeps its scheme and a few characters of
 * its id; anything else is shown whole. */
function shorten(name: string): string {
  if (!hasScheme(name) || name.length <= 22) return name;
  const colon = name.indexOf(":");
  return `${name.slice(0, colon + 1)}${name.slice(colon + 1, colon + 9)}…`;
}

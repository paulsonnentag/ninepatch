// the page furniture: tools as Solid components, and a section — prose
// plus three panels: the live example, the code, and the directories

import {
  createEffect,
  createMemo,
  createResource,
  createRoot,
  createSignal,
  ErrorBoundary,
  For,
  from,
  onCleanup,
  onMount,
  Show,
  splitProps,
  type Accessor,
  type JSX,
} from "solid-js";
import {
  hasScheme,
  type Handle,
  type Directory,
  type Main,
  type Process,
} from "@ninepatch/core";
import { javascript } from "@codemirror/lang-javascript";
import { syntaxHighlighting } from "@codemirror/language";
import { EditorState, RangeSetBuilder, Text } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { classHighlighter } from "@lezer/highlight";
import { Portal, render } from "solid-js/web";
import { RawEditor } from "./raw-editor";
import { processes, registerTool } from "./boot";

export type Source = { name: string; code: string };

// a tool as a Solid component: forks `dir`, mounts every other prop as an
// entry plus its element as `dom`, spawns the module, closes on cleanup
export function createComponent<
  Props extends Record<string, unknown> = Record<never, never>,
>(tool: string | Main, name?: string) {
  const url =
    typeof tool === "string" ? tool : registerTool(name ?? tool.name, tool);
  const fallback = componentName(url);
  return function Component(props: Props & { dir: Directory; name?: string }) {
    const [own, mounts] = splitProps(props, ["dir", "name"]);
    const dir = own.dir.fork(own.name ?? fallback);
    const el = (<div class="tool" />) as HTMLDivElement;
    for (const [entry, value] of Object.entries(mounts))
      dir.mount(entry, value);
    dir.mount("dom", el);
    const process = dir.spawn(fallback, url); // the node reads as the tool, the window as the instance
    process.terminated.catch((e: unknown) => {
      if (!dir.signal.aborted) el.textContent = String(e);
    });
    onCleanup(() => dir.close());
    return el;
  };
}

function componentName(url: string): string {
  const base = url
    .split("/")
    .pop()!
    .replace(/^tool:/, "")
    .replace(/\.tsx?$/, "");
  return base[0].toUpperCase() + base.slice(1); // chat.tsx runs as "Chat"
}

// a section: title and prose, then a band — preview | data | code
export function Section(props: {
  title: string;
  prose: JSX.Element;
  sources: Source[];
  /** The section's directory, last, after everything it was forked from. */
  chain: Directory[];
  /** Puts the demo's documents back in their seeded state. */
  reset?: () => void;
  children: JSX.Element;
}) {
  const [widths, setWidths] = createSignal([1, 2]);
  let band!: HTMLDivElement;

  // a divider drag moves width between its neighbours, in fractions
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
      <h2>
        {props.title}
        <Show when={props.reset}>
          <button class="reset" onClick={() => props.reset!()}>
            reset
          </button>
        </Show>
      </h2>
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
        <div class="panel context">
          <h3>inspector</h3>
          <div class="panel-body">
            <Windows chain={props.chain} sources={props.sources} />
          </div>
        </div>
      </div>
    </section>
  );
}

// a `dir.open("name")` on a line: the entry that line depends on
const OPENS = /\.open(?:<[^>]*>)?\(\s*["'`]([^"'`]+)/;

// every line that opens an entry is tagged with it, so the dependency
// lines can start there and hovering it lights the entry
function opensDecorations(code: string) {
  const doc = Text.of(code.split("\n"));
  const builder = new RangeSetBuilder<Decoration>();
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const name = OPENS.exec(line.text)?.[1];
    if (name)
      builder.add(
        line.from,
        line.from,
        Decoration.line({
          class: "cm-opens",
          attributes: { "data-opens": name },
        })
      );
  }
  return EditorView.decorations.of(builder.finish());
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

// an entry picked in some window, and that window's probe for links
type Selection = {
  row: EntryRow;
  dir: Directory;
  probe: Directory | undefined;
};

// how a window is found from elsewhere — the preview's "from" link
type Registry = Map<Directory, () => void>;

// one window per directory, processes as nodes beside them; one selection
// for the whole tree, so picking in one window closes the others
function Windows(props: { chain: Directory[]; sources: Source[] }) {
  const registry: Registry = new Map();
  const table = from(processes, processes.value);
  const [column, setColumn] = createSignal<HTMLDivElement>();
  let tree!: HTMLDivElement;
  mountHighlight();
  mountProcLines();
  trackFocusedUrl();
  onMount(() => {
    const observer = new ResizeObserver(bumpLayout);
    observer.observe(tree);
    observer.observe(column()!); // hidden while empty, so it appears with the first window
    onCleanup(() => observer.disconnect());
  });
  return (
    <div class="windows" role="tree">
      <div class="tree" ref={tree}>
        <Node
          chain={props.chain}
          depth={0}
          registry={registry}
          processes={table}
          sources={props.sources}
          column={column}
        />
      </div>
      <div class="code-column" ref={setColumn} />
    </div>
  );
}

// the tree changed shape: code windows re-align with their directory window
const [layout, bumpLayout] = createSignal(0, { equals: false });

// --- selection ------------------------------------------------------------------

// Every window keeps its own selection; one window on the page is focused.
// The focused window's selection is blue, the others' gray, and the same
// url as the focused selection is lit wherever it is mounted, in any
// section. Page-wide, like the process lines.
const [selections, setSelections] = createSignal<Map<Directory, Selection>>(
  new Map()
);
const [focusedWindow, setFocusedWindow] = createSignal<Directory>();
const focusedSelection = () => {
  const dir = focusedWindow();
  return dir && selections().get(dir);
};
const [focusedUrl, setFocusedUrl] = createSignal<string>();

function select(dir: Directory, sel: Selection | undefined): void {
  setSelections((prev) => {
    const next = new Map(prev);
    if (sel) next.set(dir, sel);
    else next.delete(dir);
    return next;
  });
  if (sel) setFocusedWindow(dir);
  else if (focusedWindow() === dir) setFocusedWindow(undefined);
}

let focusedUrlTracked = false;

// the focused selection's value while it is a url, followed live
function trackFocusedUrl() {
  if (focusedUrlTracked) return;
  focusedUrlTracked = true;
  createRoot(() =>
    createEffect(() => {
      const sel = focusedSelection();
      if (!sel) return setFocusedUrl(undefined);
      const unsub = sel.row.handle.subscribe((v) =>
        setFocusedUrl(typeof v === "string" && hasScheme(v) ? v : undefined)
      );
      onCleanup(unsub);
    })
  );
}

// one directory as a window: inherited entries faint, own after, children
// hanging below; a directory that mounted nothing is not drawn, and the
// viewer's own opens go through a probe fork so they never show as windows
function Node(props: {
  chain: Directory[];
  depth: number;
  registry: Registry;
  processes: Accessor<Process[]>;
  sources: Source[];
  column: Accessor<HTMLDivElement | undefined>;
}) {
  const self = props.chain[props.chain.length - 1];
  const probe = tryFork(self);
  onCleanup(() => probe?.close());
  const rows = createRows(props.chain);
  const own = () => rows().filter((row) => !row.inherited);
  const kids = from(self.children, self.children.value);
  /** What runs here — drawn beside the window, never inside it. */
  const procs = () => props.processes().filter((p) => p.at === self);
  // processes' forks belong under this window; their opens stay internal
  const [procKids, setProcKids] = createSignal<Directory[]>([]);
  createEffect(() => {
    const running = procs();
    const collect = () =>
      setProcKids(
        running.flatMap((p) =>
          p.dir.children.value.filter((c) => c.path.length === 0)
        )
      );
    const unsubs = running.map((p) => p.dir.children.subscribe(collect));
    onCleanup(() => unsubs.forEach((u) => u()));
  });
  const children = () => [...kids().filter((c) => c !== probe), ...procKids()];
  // nothing to show: mounted nothing and runs nothing
  const transparent = () =>
    procs().length === 0 &&
    (props.depth > 0 ? own().length === 0 : rows().length === 0);
  const [folded, setFolded] = createSignal(props.depth > 0); // nested windows start closed
  const [height, setHeight] = createSignal(250);
  // the process whose source is open in the code column beside this window
  const [code, setCode] = createSignal<Process>();
  const isLit = (row: EntryRow) => {
    const dep = hoveredDep();
    return dep?.name === row.key && procs().some((p) => p.pid === dep.pid);
  };
  const sourceFor = (p: Process) =>
    props.sources.find((src) => src.name === p.url.split("/").pop());
  let el!: HTMLDivElement;

  // the bottom edge drags, never shorter than the title bar and a few rows
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

  const mine = () => selections().get(self);
  const isFocused = () => focusedWindow() === self;
  const isSelected = (row: EntryRow) => mine()?.row.key === row.key;
  // this row is where the focused selection, in a window below, was
  // inherited from
  const isOrigin = (row: EntryRow) => {
    const sel = focusedSelection();
    return (
      sel !== undefined &&
      sel.dir !== self &&
      sel.row.owner === self &&
      sel.row.key === row.key
    );
  };
  // this row holds the same url as the focused selection, anywhere on the page
  const isTwin = (row: EntryRow, value: unknown) => {
    const url = focusedUrl();
    return (
      url !== undefined && value === url && !(isFocused() && isSelected(row))
    );
  };

  props.registry.set(self, () => {
    setFolded(false);
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
  onCleanup(() => props.registry.delete(self));

  // a selection that no longer exists — the entry went, or this directory
  // closed — is dropped
  createEffect(() => {
    const sel = mine();
    if (!sel) return;
    const row = rows().find((r) => r.key === sel.row.key);
    if (!row) select(self, undefined);
    else if (row !== sel.row) select(self, { ...sel, row });
  });
  onCleanup(() => select(self, undefined));

  const below = () => (
    <For each={children()}>
      {(child) => (
        <Node
          chain={[...props.chain, child]}
          depth={transparent() ? props.depth : props.depth + 1}
          registry={props.registry}
          processes={props.processes}
          sources={props.sources}
          column={props.column}
        />
      )}
    </For>
  );

  return (
    <Show when={!transparent()} fallback={below()}>
      <div class="folder-node">
        <div class="window-row">
          <div
            class="window"
            classList={{
              open: mine() !== undefined,
              focused: isFocused(),
              folded: folded(),
            }}
            style={{ "--height": `${height()}px` }}
            ref={el}
            onPointerDown={() => setFocusedWindow(self)}
          >
            <div class="titlebar" title={self.name}>
              <span class="window-title">{label(self.name)}</span>
              <Show when={folded()}>
                <span class="window-count">{rows().length} entries</span>
              </Show>
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
                    {(row) => {
                      const value = from(row.handle, readValue(row.handle));
                      return (
                        <div
                          class="tree-item"
                          data-path={row.key}
                          classList={{
                            selected: isSelected(row),
                            origin: isOrigin(row),
                            twin: isTwin(row, value()),
                            lit: isLit(row),
                            inherited: row.inherited,
                          }}
                          title={
                            row.inherited
                              ? `from ${row.owner.name}`
                              : `mounted here`
                          }
                          onClick={() =>
                            select(self, { row, dir: self, probe })
                          }
                          onMouseEnter={(e) => setHoveredRow(e.currentTarget)}
                          onMouseLeave={(e) =>
                            setHoveredRow((r) =>
                              r === e.currentTarget ? undefined : r
                            )
                          }
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
                      );
                    }}
                  </For>
                </div>
                <Show when={mine()} keyed>
                  {(sel) => (
                    <Preview
                      selection={sel}
                      reveal={(dir) => props.registry.get(dir)?.()}
                      close={() => select(self, undefined)}
                    />
                  )}
                </Show>
              </div>
              <div class="window-grip" onPointerDown={resize} />
            </Show>
          </div>
          <div class="procs">
            <For each={procs()}>
              {(p) => (
                <ProcNode
                  process={p}
                  open={code() === p}
                  onToggle={() => setCode(code() === p ? undefined : p)}
                />
              )}
            </For>
          </div>
          <Show when={props.column()}>
            {(column) => (
              <Show when={code()} keyed>
                {(p) => (
                  <Portal mount={column()}>
                    <CodeWindow
                      process={p}
                      source={sourceFor(p)}
                      anchor={el}
                      column={column()}
                      height={height()}
                      close={() => setCode(undefined)}
                    />
                  </Portal>
                )}
              </Show>
            )}
          </Show>
        </div>
        <div class="folder-children">{below()}</div>
      </div>
    </Show>
  );
}

// --- processes ------------------------------------------------------------

// what lights a line blue: the pill under the pointer lights all of its
// process's lines, a line of code or an entry row lights just its own
const [hoveredProc, setHoveredProc] = createSignal<Process>();
const [hoveredDep, setHoveredDep] = createSignal<{
  pid: Process["pid"];
  name: string;
}>();
const [hoveredRow, setHoveredRow] = createSignal<Element>();
// the processes with lines drawn; their pills need no stub of their own
const [linked, setLinked] = createSignal(new Set<Process["pid"]>());

// a process beside its directory's window; hover lights its lines, click
// opens the node up into a box of its source in the code column; while
// open the pill is gone, the box is the node
function ProcNode(props: {
  process: Process;
  open: boolean;
  onToggle: () => void;
}) {
  const p = props.process;
  const unhover = () => setHoveredProc((h) => (h === p ? undefined : h));
  onCleanup(unhover);
  createEffect(() => props.open && unhover()); // the pill vanished under the pointer
  return (
    <button
      class="proc"
      classList={{
        focused: hoveredProc() === p,
        open: props.open,
        linked: linked().has(p.pid),
      }}
      data-pid={p.pid}
      title={p.url}
      onMouseEnter={() => setHoveredProc(p)}
      onMouseLeave={unhover}
      onClick={props.onToggle}
    >
      <span class="proc-name">{p.name}</span>
    </button>
  );
}

// the process's source, read-only, in the code column level with its
// directory window and as tall as it stands unfolded
function CodeWindow(props: {
  process: Process;
  source: Source | undefined;
  anchor: HTMLElement;
  column: HTMLElement;
  height: number;
  close: () => void;
}) {
  const code = props.source?.code ?? `// no source for ${props.process.url}`;
  const box = createMemo(() => {
    layout();
    const a = props.anchor.getBoundingClientRect();
    const c = props.column.getBoundingClientRect();
    return { "margin-top": `${a.top - c.top}px`, height: `${props.height}px` };
  });
  let host!: HTMLDivElement;
  onMount(() => {
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: code,
        extensions: [
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          javascript({ jsx: true, typescript: true }),
          syntaxHighlighting(classHighlighter),
          opensDecorations(code),
        ],
      }),
    });
    onCleanup(() => view.destroy());
  });
  const hover = (e: MouseEvent) => {
    const line = (e.target as Element).closest?.<HTMLElement>(".cm-opens");
    const name = line?.dataset.opens;
    setHoveredDep(name ? { pid: props.process.pid, name } : undefined);
  };
  return (
    <div class="code-window" data-code-pid={props.process.pid} style={box()}>
      <div class="code-titlebar" title={props.process.url}>
        <span class="code-title">{props.process.name}</span>
        <span class="code-file">{props.source?.name}</span>
        <button class="fold code-close" title="close" onClick={props.close}>
          <CloseIcon />
        </button>
      </div>
      <div
        class="code-body"
        ref={host}
        onMouseMove={hover}
        onMouseLeave={() => setHoveredDep(undefined)}
      />
    </div>
  );
}

function CloseIcon() {
  return (
    <svg class="icon fold-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </svg>
  );
}

let procLinesMounted = false;

function mountProcLines() {
  if (procLinesMounted) return;
  procLinesMounted = true;
  render(() => <ProcLines />, document.body);
}

// one overlay for the whole page: lines from every process to the rows it
// has open, gray, the hovered or clicked one's in colour; redrawn on
// scroll and resize
function ProcLines() {
  const table = from(processes, processes.value);
  const [bump, setBump] = createSignal(0, { equals: false });
  const redraw = () => setBump(0);
  document.addEventListener("scroll", redraw, { capture: true, passive: true });
  addEventListener("resize", redraw);
  onCleanup(() => {
    document.removeEventListener("scroll", redraw, { capture: true });
    removeEventListener("resize", redraw);
  });

  /** What every process has open, live. */
  const [opened, setOpened] = createSignal(new Map<Process, string[]>());
  createEffect(() => {
    const unsubs = table().map((p) =>
      p.dir.children.subscribe((kids) =>
        setOpened((m) =>
          new Map(m).set(
            p,
            kids.map((c) => c.name)
          )
        )
      )
    );
    onCleanup(() => {
      unsubs.forEach((u) => u());
      setOpened(new Map());
    });
  });

  createEffect(() => {
    layout();
    selections(); // a preview opening or closing changes which lines show
    requestAnimationFrame(redraw); // after the code windows re-align
  });

  const lines = createMemo(() => {
    bump();
    const proc = hoveredProc();
    const dep = hoveredDep();
    const row = hoveredRow();
    const all = table().flatMap((p) =>
      linesFor(p, opened().get(p) ?? []).map((line) => ({
        d: line.d,
        ends: line.ends,
        pid: p.pid,
        focused:
          p === proc ||
          (dep?.pid === p.pid && dep.name === line.name) ||
          (row !== undefined && row === line.item),
      }))
    );
    return all.sort((a, b) => Number(a.focused) - Number(b.focused)); // colour on top
  });
  createEffect(() => setLinked(new Set(lines().map((l) => l.pid))));

  return (
    <svg class="proc-lines" aria-hidden="true">
      <For each={lines()}>
        {(line) => (
          <g classList={{ focused: line.focused }}>
            <path d={line.d} />
            <For each={line.ends}>
              {(end) => <circle cx={end.x} cy={end.y} r="2.5" />}
            </For>
          </g>
        )}
      </For>
    </svg>
  );
}

type Line = {
  d: string;
  ends: [Point, Point]; // a dot at each end
  name?: string;
  item?: Element;
};

// a process's lines: from its node, or the code lines in its open box, down
// the lane and into the rows it has open
function linesFor(p: Process, names: string[]): Line[] {
  const chip = document.querySelector(`.proc[data-pid="${p.pid}"]`);
  const win = chip?.closest(".window-row")?.querySelector(".window");
  const body = win?.querySelector(".window-body");
  const box = document.querySelector(`.code-window[data-code-pid="${p.pid}"]`);
  if (!chip || !win) return [];
  // the directory folded with the box open: one line, window to box
  if (!body) {
    if (!box) return [];
    const w = win.getBoundingClientRect();
    const c = box.getBoundingClientRect();
    const from = { x: w.right, y: w.top + 16 };
    const to = { x: c.left, y: c.top + 16 };
    return [{ d: `M ${from.x} ${from.y} L ${to.x} ${to.y}`, ends: [from, to] }];
  }
  const source = box?.querySelector(".cm-scroller");
  // the node: the open box, or the pill in the lane
  const c = (box ?? chip).getBoundingClientRect();
  const b = body.getBoundingClientRect();
  const s = source?.getBoundingClientRect();
  const fromChip = { x: c.left, y: c.top + (box ? 16 : c.height / 2) };
  const trunk = (b.right + c.left) / 2; // down the lane beside the window
  // a preview covers the rows' right side: only the selected entry's line,
  // and it stops at the window's edge
  const selected = body.querySelector(".preview")
    ? body.querySelector(".tree-item.selected")?.getAttribute("data-path")
    : undefined;
  const out: Line[] = [];
  for (const name of names) {
    if (selected !== undefined && name !== selected) continue;
    const item = body.querySelector(`[data-path="${CSS.escape(name)}"]`);
    if (!item) continue;
    const r = item.getBoundingClientRect();
    if (r.bottom < b.top || r.top > b.bottom) continue; // scrolled out of the window
    // from the line of code that opened it, when its source is open
    const line = source?.querySelector(`[data-opens="${CSS.escape(name)}"]`);
    const l = line?.getBoundingClientRect();
    const start =
      l && s && l.bottom >= s.top && l.top <= s.bottom
        ? { x: s.left, y: l.top + l.height / 2 }
        : fromChip;
    const end = {
      x: selected !== undefined ? b.right : r.right - 6,
      y: r.top + r.height / 2,
    };
    out.push({ d: hook(start, trunk, end), ends: [start, end], name, item });
  }
  return out;
}

type Point = { x: number; y: number };

// the connector: out of the node, down the trunk, an elbow into the row
function hook(start: Point, trunk: number, end: Point): string {
  const radius = Math.min(6, Math.abs(end.y - start.y) / 2);
  if (radius < 1) return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  const down = end.y > start.y ? 1 : -1;
  const ahead = trunk > start.x ? 1 : -1; // which way the first leg runs
  return [
    `M ${start.x} ${start.y}`,
    `L ${trunk - ahead * radius} ${start.y}`,
    `Q ${trunk} ${start.y} ${trunk} ${start.y + down * radius}`,
    `L ${trunk} ${end.y - down * radius}`,
    `Q ${trunk} ${end.y} ${trunk + ahead * radius} ${end.y}`,
    `L ${end.x} ${end.y}`,
  ].join(" ");
}

// the selected entry in full: where it came from, and its value — a link
// as the document it points at, an element as its DOM tree, the rest raw
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

// a one-line summary, or with `editor` the full thing; a link is opened
// through the probe so it is drawn as what it points at, live
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

// opens through the probe — a resource, so NotFound reaches the boundary
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

// what kind of thing a value is, not what it says
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

// an element as the inspector would show it; hovering a line lights up
// that element in the page
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

// the element under the mouse, and one page-wide highlight box over it
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

// what a walk would find: inherited entries first, own after, nearest
// overlay winning; URL-keyed fills are the plumbing, not the picture
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

// `automerge:4NMNnkMh…` — a URL keeps its scheme and a few id characters
function shorten(name: string): string {
  if (!hasScheme(name) || name.length <= 22) return name;
  const colon = name.indexOf(":");
  return `${name.slice(0, colon + 1)}${name.slice(colon + 1, colon + 9)}…`;
}

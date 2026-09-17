// the page furniture: tools as Solid components, and a section — prose
// plus two panels: the live example and the directories

import {
  batch,
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
  untrack,
  type Accessor,
  type JSX,
} from "solid-js";
import {
  field,
  hasScheme,
  type Handle,
  type Directory,
  type Main,
  type Process,
  type Resolution,
} from "@ninepatch/core";
import { render } from "solid-js/web";
import { isPrimitive, PrimitiveField, RawEditor } from "./raw-editor";
import { processes, registerTool } from "./boot";

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

// a section: title and prose, then a band — preview | inspector, which
// stacks on a narrow screen
export function Section(props: {
  title: string;
  prose: JSX.Element;
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
          "--columns": widths()
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
            <Windows chain={props.chain} />
          </div>
        </div>
      </div>
    </section>
  );
}

// --- the windows --------------------------------------------------------------

// where a name comes from: the directory whose entry holds it; a name
// with no owner is a key of the value there
type Owner = {
  owner: Directory;
  handle: Handle<unknown>;
  inherited: boolean;
  /** The entry's path in the owner's own coordinates. */
  ownerPath: string[];
};

function ownerOf(
  self: Directory,
  r: Resolution | undefined
): Owner | undefined {
  if (!r?.owner || !r.ownerPath) return undefined;
  return {
    owner: r.owner,
    handle: r.handle,
    inherited: r.owner !== self,
    ownerPath: r.ownerPath,
  };
}

// a path picked in some window — one name per column — and that window's
// probe for opening things
type Selection = {
  path: string[];
  dir: Directory;
  probe: Directory | undefined;
  /** The thing at the end of the path: the entry as mounted, or a field. */
  handle: Handle<unknown> | undefined;
  from: Owner | undefined;
};

// a pane across a window: the listing at a path, or the picked leaf's preview
type Pane =
  { kind: "listing"; path: string[] } | { kind: "preview"; sel: Selection };

// how long a pane takes to slide in or out — the transition in the css
const SLIDE_MS = 250;

// how a window is found from elsewhere — the preview's "from" link
type Registry = Map<Directory, () => void>;

// one window per directory, processes as nodes beside them; one selection
// for the whole tree, so picking in one window closes the others
function Windows(props: { chain: Directory[] }) {
  const registry: Registry = new Map();
  const table = from(processes, processes.value);
  let tree!: HTMLDivElement;
  mountHighlight();
  mountProcLines();
  trackFocusedUrl();
  onMount(() => {
    const observer = new ResizeObserver(bumpLayout);
    observer.observe(tree);
    onCleanup(() => observer.disconnect());
  });
  return (
    <div class="windows" role="tree" ref={tree}>
      <Node
        chain={props.chain}
        depth={0}
        registry={registry}
        processes={table}
      />
    </div>
  );
}

// the tree changed shape: the process lines are redrawn to the rows
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
      if (!sel?.handle) return setFocusedUrl(undefined);
      const unsub = sel.handle.subscribe((v) =>
        setFocusedUrl(typeof v === "string" && hasScheme(v) ? v : undefined)
      );
      onCleanup(unsub);
    })
  );
}

// one directory as a window: what a reader sees, as columns — pick a name
// and the next column is what is below it, down to a leaf's value;
// children hang below the window; a directory that mounted nothing is not
// drawn, and the viewer's own opens go through a probe fork so they never
// show as windows
function Node(props: {
  chain: Directory[];
  depth: number;
  registry: Registry;
  processes: Accessor<Process[]>;
}) {
  const self = props.chain[props.chain.length - 1];
  const probe = tryFork(self);
  onCleanup(() => probe?.close());
  const names = from(self.list(), self.list().value);
  const entries = from(self.entries, self.entries.value);
  const own = () => entries().filter((e) => e.handle && !hasScheme(e.path[0]));
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
    (props.depth > 0 ? own().length === 0 : names().length === 0);
  const [folded, setFolded] = createSignal(props.depth > 0); // nested windows start closed
  const [height, setHeight] = createSignal(250);
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
  // where the window is looking: the folder open in the right-hand pane;
  // the title bar spells the way there as a breadcrumb
  const [at, setAt] = createSignal<string[]>([]);
  const here = createMemo(() => {
    const path = at();
    return from(self.list(path), self.list(path).value);
  });
  const go = (path: string[]) =>
    batch(() => {
      setAt(path);
      select(self, undefined);
    });
  // the picked name, when it is in the listing at `path`
  const selectedIn = (path: string[]) => {
    const sel = mine();
    if (!sel || sel.path.slice(0, -1).join("/") !== path.join("/")) return;
    return sel.path[sel.path.length - 1];
  };
  // the name walked into from the listing at `path`: the next step of the way
  const walkedIn = (path: string[]) => {
    const way = at();
    if (way.length <= path.length) return;
    return path.every((n, i) => n === way[i]) ? way[path.length] : undefined;
  };
  // a name with names below it opens in the pane to its right; a leaf is
  // picked and previewed there, and picked again is let go
  const pick = (
    path: string[],
    handle: Handle<unknown> | undefined,
    owner: Owner | undefined,
    folder: boolean
  ) => {
    const parent = path.slice(0, -1);
    if (folder) return go(path);
    if (selectedIn(parent) === path[path.length - 1])
      return select(self, undefined);
    batch(() => {
      setAt(parent);
      select(self, { path, dir: self, probe, handle, from: owner });
    });
  };

  // the panes across the window: a listing for every step of the way, then
  // the picked leaf's preview; the last two show, the rest have slid off
  // to the left. Panes keep their identity so a step back finds them again.
  const listings = new Map<string, Pane>();
  let preview: Pane | undefined;
  const panes = createMemo<Pane[]>(() => {
    const way = at();
    const out: Pane[] = [];
    for (let i = 0; i <= way.length; i++) {
      const path = way.slice(0, i);
      const key = path.join("/");
      let pane = listings.get(key);
      if (!pane) listings.set(key, (pane = { kind: "listing", path }));
      out.push(pane);
    }
    const sel = mine();
    if (sel) {
      if (preview?.kind !== "preview" || preview.sel !== sel)
        preview = { kind: "preview", sel };
      out.push(preview);
    }
    return out;
  });
  // a step back keeps the pane it leaves until it has slid out of view
  const [shown, setShown] = createSignal(panes());
  createEffect(() => {
    const next = panes();
    const prev = untrack(shown);
    const back =
      next.length < prev.length && next.every((p, i) => p === prev[i]);
    if (!back) return setShown(next);
    const timer = setTimeout(() => setShown(next), SLIDE_MS);
    onCleanup(() => clearTimeout(timer));
  });
  const behind = () => Math.max(0, panes().length - 2);
  createEffect(() => {
    panes();
    bumpLayout(0); // the rows the process lines end at have moved
  });

  props.registry.set(self, () => {
    setFolded(false);
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
  onCleanup(() => props.registry.delete(self));

  // a place that no longer exists goes back to the top; a selection that
  // no longer exists — the name went, or this directory closed — is dropped
  createEffect(() => {
    const listing = here()();
    if (at().length > 0 && listing.length === 0) return go([]);
    const sel = mine();
    if (sel && !listing.includes(sel.path[sel.path.length - 1]))
      select(self, undefined);
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
              focused: isFocused(),
              folded: folded(),
            }}
            style={{ "--height": `${height()}px` }}
            ref={el}
            onPointerDown={() => setFocusedWindow(self)}
          >
            <div class="titlebar" title={self.name}>
              <nav class="crumbs">
                <button
                  class="crumb"
                  classList={{ current: at().length === 0 }}
                  onClick={() => go([])}
                >
                  {label(self.name)}
                </button>
                <For each={at()}>
                  {(name, i) => (
                    <>
                      <span class="crumb-sep">›</span>
                      <button
                        class="crumb"
                        classList={{ current: i() === at().length - 1 }}
                        onClick={() => go(at().slice(0, i() + 1))}
                      >
                        {name}
                      </button>
                    </>
                  )}
                </For>
              </nav>
              <Show when={folded()}>
                <span class="window-count">{names().length} names</span>
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
                <div
                  class="strip"
                  classList={{ single: panes().length === 1 }}
                  style={{ "--behind": behind() }}
                  onTransitionEnd={() => bumpLayout(0)}
                >
                  <For each={shown()}>
                    {(pane) =>
                      pane.kind === "listing" ? (
                        <Listing
                          self={self}
                          probe={probe}
                          path={pane.path}
                          selected={selectedIn(pane.path)}
                          walked={walkedIn(pane.path)}
                          focused={isFocused()}
                          pick={pick}
                        />
                      ) : (
                        <Preview
                          selection={pane.sel}
                          reveal={(dir) => props.registry.get(dir)?.()}
                          close={() => select(self, undefined)}
                        />
                      )
                    }
                  </For>
                </div>
              </div>
              <div class="window-grip" onPointerDown={resize} />
            </Show>
          </div>
          <div class="procs">
            <For each={procs()}>{(p) => <ProcNode process={p} />}</For>
          </div>
        </div>
        <div class="folder-children">{below()}</div>
      </div>
    </Show>
  );
}

// the names a reader sees at `path`, each with where it came from and a
// summary of what is there — resolved the way a read is, live; a name
// that resolves to nothing yet (a URL not loaded) reads through the place,
// opened once through the probe
function Listing(props: {
  self: Directory;
  probe: Directory | undefined;
  path: string[];
  selected: string | undefined;
  /** The name whose listing is open in the pane to the right. */
  walked: string | undefined;
  focused: boolean;
  pick: (
    path: string[],
    handle: Handle<unknown> | undefined,
    owner: Owner | undefined,
    folder: boolean
  ) => void;
}) {
  const names = from(
    props.self.list(props.path),
    props.self.list(props.path).value
  );
  let held: Directory | undefined;
  const [opened] = createResource(async () => {
    if (props.path.length === 0)
      return props.self as unknown as Handle<unknown>; // every directory reads as one
    if (!props.probe) return undefined;
    try {
      return (held = await props.probe.open<unknown>(props.path));
    } catch {
      return undefined; // a name with nothing at it: the rows stand on their own
    }
  });
  onCleanup(() => held?.close());

  // this row is where the focused selection, in another window, was
  // inherited from
  const isOrigin = (key: string) => {
    const sel = focusedSelection();
    return (
      sel !== undefined &&
      sel.dir !== props.self &&
      sel.from?.owner === props.self &&
      sel.from.ownerPath.join("/") === key
    );
  };
  // this row holds the same url as the focused selection, anywhere on the page
  const isTwin = (name: string, value: unknown) => {
    const url = focusedUrl();
    return (
      url !== undefined &&
      value === url &&
      !(props.focused && props.selected === name)
    );
  };

  return (
    <div class="entries">
      <For each={names()}>
        {(name) => {
          const path = [...props.path, name];
          const key = path.join("/");
          const resolved = from(
            props.self.resolve(path),
            props.self.resolve(path).value
          );
          const owner = createMemo(() => ownerOf(props.self, resolved()));
          const handle = createMemo(
            () =>
              resolved()?.handle ??
              (opened() ? field<unknown>(opened()!, [name]) : undefined)
          );
          const [value, setValue] = createSignal<unknown>();
          // a plain value is edited in its row; a link stays a link
          const inline = () =>
            below().length === 0 &&
            handle() !== undefined &&
            isPrimitive(value()) &&
            !(typeof value() === "string" && hasScheme(value() as string));
          createEffect(() => {
            const h = handle();
            if (!h) return setValue(undefined);
            const unsub = h.subscribe((v) => setValue(() => v));
            onCleanup(unsub);
          });
          const below = from(
            props.self.list(path),
            props.self.list(path).value
          );
          return (
            <div
              class="tree-item"
              data-path={key}
              classList={{
                selected: props.selected === name,
                walked: props.walked === name,
                origin: isOrigin(key),
                twin: isTwin(name, value()),
                inherited: owner()?.inherited ?? false,
                folder: below().length > 0,
              }}
              title={
                owner()
                  ? owner()!.inherited
                    ? `from ${owner()!.owner.name}`
                    : "mounted here"
                  : "a field"
              }
              onClick={() =>
                props.pick(path, handle(), owner(), below().length > 0)
              }
              onMouseEnter={(e) => setHoveredRow(e.currentTarget)}
              onMouseLeave={(e) =>
                setHoveredRow((r) => (r === e.currentTarget ? undefined : r))
              }
            >
              <Show when={below().length > 0} fallback={<FileIcon />}>
                <FolderIcon open={false} />
              </Show>
              <span class="tree-name">{name}</span>
              <span class="tree-value">
                <Show when={inline()} fallback={<Summary value={value()} />}>
                  <PrimitiveField
                    value={value()}
                    set={(v) => handle()!.set(v)}
                    compact
                  />
                </Show>
              </span>
              <Show when={below().length > 0}>
                <span class="tree-more">›</span>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}

// --- processes ------------------------------------------------------------

// what lights a line blue: the pill under the pointer lights all of its
// process's lines, an entry row lights just its own
const [hoveredProc, setHoveredProc] = createSignal<Process>();
const [hoveredRow, setHoveredRow] = createSignal<Element>();
// the processes with lines drawn; their pills need no stub of their own
const [linked, setLinked] = createSignal(new Set<Process["pid"]>());

// a process beside its directory's window; hovering it lights its lines,
// and a tap does the same where there is no pointer to hover with
function ProcNode(props: { process: Process }) {
  const p = props.process;
  const unhover = () => setHoveredProc((h) => (h === p ? undefined : h));
  onCleanup(unhover);
  return (
    <button
      class="proc"
      classList={{ focused: hoveredProc() === p, linked: linked().has(p.pid) }}
      data-pid={p.pid}
      title={p.url}
      onMouseEnter={() => setHoveredProc(p)}
      onMouseLeave={unhover}
      onClick={() => setHoveredProc(p)}
    >
      <span class="proc-name">{p.name}</span>
    </button>
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
    requestAnimationFrame(redraw); // after the panes have moved
  });

  const lines = createMemo(() => {
    bump();
    const proc = hoveredProc();
    const row = hoveredRow();
    const all = table().flatMap((p) =>
      linesFor(p, opened().get(p) ?? []).map((line) => ({
        d: line.d,
        pid: p.pid,
        focused: p === proc || row === line.item,
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
          </g>
        )}
      </For>
    </svg>
  );
}

type Line = { d: string; item: Element };

// a process's lines: from its pill, down the lane and into the rows it has
// open; a folded window has no rows to reach
function linesFor(p: Process, names: string[]): Line[] {
  const chip = document.querySelector(`.proc[data-pid="${p.pid}"]`);
  const body = chip?.closest(".window-row")?.querySelector(".window-body");
  if (!chip || !body) return [];
  const c = chip.getBoundingClientRect();
  const b = body.getBoundingClientRect();
  const start = { x: c.left, y: c.top + c.height / 2 };
  const trunk = (b.right + c.left) / 2; // down the lane beside the window
  // a preview covers the rows' right side: only the selected entry's line
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
    if (r.right < b.left || r.left > b.right) continue; // in a pane that slid away
    const end = { x: b.right, y: r.top + r.height / 2 }; // stops at the window's edge
    out.push({ d: hook(start, trunk, end), item });
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

// a picked leaf in full: where it came from, and its value — a link as the
// document it points at, an element as its DOM tree, the rest raw
function Preview(props: {
  selection: Selection;
  reveal: (dir: Directory) => void;
  close: () => void;
}) {
  const { path, probe, handle, from: owner } = props.selection;
  return (
    <div class="preview">
      <div class="preview-head">
        <FileIcon />
        <code class="preview-path">{path[path.length - 1]}</code>
        <Show when={owner?.inherited}>
          <span class="preview-where">
            from{" "}
            <button
              class="preview-from"
              onClick={() => props.reveal(owner!.owner)}
            >
              {label(owner!.owner.name)}
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
        <Show when={handle} fallback={<i>—</i>}>
          {(h) => <Value handle={h()} path={path} probe={probe} editor />}
        </Show>
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
              <Show
                when={isFolderValue(value())}
                fallback={<RawEditor handle={props.handle} />}
              >
                <FolderView handle={props.handle} />
              </Show>
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
            <Show
              when={isFolderValue(value())}
              fallback={<RawEditor handle={target()} />}
            >
              <FolderView handle={target()} />
            </Show>
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
  if (v instanceof Element) {
    const cls = v.classList[0] ? `.${v.classList[0]}` : "";
    return <code>{`<${v.tagName.toLowerCase()}${cls}>`}</code>;
  }
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

// --- the folder view ------------------------------------------------------------

// an object in the preview: fields as rows like a directory listing,
// objects nested and foldable — the json view is only for primitives
function isFolderValue(v: unknown): boolean {
  return (
    typeof v === "object" &&
    v !== null &&
    !(v instanceof Uint8Array) &&
    !(v instanceof Element)
  );
}

function FolderView(props: { handle: Handle<unknown> }) {
  const value = from(props.handle, readValue(props.handle));
  return (
    <div class="folder-view">
      <FolderRows value={value()} depth={0} />
    </div>
  );
}

function FolderRows(props: { value: unknown; depth: number }) {
  const entries = () =>
    !isFolderValue(props.value)
      ? []
      : Array.isArray(props.value)
        ? props.value.map((v, i) => [String(i), v] as const)
        : Object.entries(props.value as Record<string, unknown>);
  return (
    <For each={entries()}>
      {([key, v]) => <FolderRow name={key} value={v} depth={props.depth} />}
    </For>
  );
}

function FolderRow(props: { name: string; value: unknown; depth: number }) {
  const [open, setOpen] = createSignal(props.depth < 1);
  const folder = () => isFolderValue(props.value);
  return (
    <>
      <div
        class="folder-row"
        classList={{ foldable: folder() }}
        style={{ "--depth": props.depth }}
        onClick={() => folder() && setOpen(!open())}
      >
        <Show when={folder()} fallback={<FileIcon />}>
          <FolderIcon open={open()} />
        </Show>
        <span class="tree-name">{props.name}</span>
        <Show when={!(folder() && open())}>
          <span class="tree-value">
            <Summary value={props.value} />
          </span>
        </Show>
      </div>
      <Show when={folder() && open()}>
        <FolderRows value={props.value} depth={props.depth + 1} />
      </Show>
    </>
  );
}

function FolderIcon(props: { open: boolean }) {
  return (
    <svg class="icon folder-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.5 3.5h4l1.5 2h7.5v7a.5.5 0 0 1-.5.5h-12a.5.5 0 0 1-.5-.5v-9z" />
      <Show when={props.open}>
        <path d="M3 7h11l-1.5 6h-11z" />
      </Show>
    </svg>
  );
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

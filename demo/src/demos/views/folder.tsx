import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  from,
  onCleanup,
  Show,
  type JSX,
} from "solid-js";
import { render } from "solid-js/web";
import { field, hasScheme, type Directory, type Handle } from "@ninepatch/core";
import type { LayoutDoc } from "../../types";

const STICKER = "application/x-ninepatch-current";

// The workspace as a directory window, the way the inspector draws one:
// a title bar, a crumb bar, and a strip of listings — walk into a name
// and its listing opens in the pane to the right. The names are live
// reads of `workspace`, so what the manager mounts is what shows:
// `surfaces/<id>` for every window, each with its `dom`, `tool` and
// `document`. The sticker on the shelf is the current document: dropped
// on a surface's `document`, the window mounts nothing of its own and the
// row reads as inherited from the workspace; peeled off, the window's own
// document is pinned back.
export default async function Folder(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const layout = await dir.open<LayoutDoc>("layout");
  const ws = await dir.open("workspace"); // a directory at the bind: lists and resolves through it
  // the bound directory itself, from the raw entry — a read would walk in
  const bound = dir.entries.value.find((e) => e.path[0] === "workspace")
    ?.handle as Directory | undefined;
  const probe = dir.fork("probe"); // the viewer's own opens, kept out of the listing

  const dispose = render(() => {
    const [at, setAt] = createSignal<string[]>([]);
    const [over, setOver] = createSignal<string>();
    const panes = createMemo(() =>
      Array.from({ length: at().length + 1 }, (_, i) => at().slice(0, i))
    );
    const behind = () => Math.max(0, panes().length - 2);
    const go = (path: string[]) => setAt(path);

    // a surface's `document`, by the surface's id, when the path is one
    const surfaceOf = (path: string[]) =>
      path.length === 3 && path[0] === "surfaces" && path[2] === "document"
        ? path[1]
        : path.length === 2 && path[0] === "surfaces"
          ? path[1]
          : undefined;
    const stick = (id: string, on: boolean) =>
      layout.change((d) => {
        const w = d.windows[id];
        if (!w) return;
        if (on) w.current = true;
        else delete w.current;
      });
    const isCurrent = (id: string) =>
      from(layout, layout.value)().windows[id]?.current === true;

    // where a listing at `path` is: the last bind on the way, from the
    // raw entries — a read would walk into it — and the path inside it
    const placeOf = (path: string[]): Place | undefined => {
      let dir = bound;
      let rel = path;
      if (!dir) return undefined;
      for (;;) {
        const hit = dir.entries.value.find(
          (e) =>
            e.handle &&
            isDirectory(e.handle) &&
            e.path.length > 0 &&
            startsWith(rel, e.path)
        );
        if (!hit) return { dir, rel };
        dir = hit.handle as unknown as Directory;
        rel = rel.slice(hit.path.length);
      }
    };

    return (
      <div class="workspace-folder">
        <div class="sticker-shelf">
          <span
            class="sticker"
            draggable="true"
            onDragStart={(e) => {
              e.dataTransfer!.setData(STICKER, "current");
              e.dataTransfer!.effectAllowed = "copy";
            }}
          >
            current document
          </span>
          <span class="shelf-hint">drop on a surface's document</span>
        </div>
        <div class="window focused" style={{ "--height": "300px" }}>
          <div class="titlebar" title={bound?.name}>
            <span class="window-title">{bound?.name ?? "workspace"}</span>
          </div>
          <div class="crumbbar">
            <nav class="crumbs">
              <button
                class="crumb"
                classList={{ current: at().length === 0 }}
                title="the top"
                onClick={() => go([])}
              >
                .
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
          </div>
          <div class="window-body">
            <div
              class="strip"
              classList={{ single: panes().length === 1 }}
              style={{ "--behind": behind() }}
            >
              <For each={panes()}>
                {(path) => (
                  <Listing
                    ws={ws}
                    probe={probe}
                    path={path}
                    place={placeOf(path)}
                    walked={at()[path.length]}
                    over={over()}
                    surfaceOf={surfaceOf}
                    isCurrent={isCurrent}
                    stick={stick}
                    setOver={setOver}
                    go={go}
                  />
                )}
              </For>
            </div>
          </div>
        </div>
      </div>
    );
  }, dom.value);
  dir.signal.addEventListener("abort", () => {
    dispose();
    probe.close();
  });
}

/** A directory on the way and the path inside it. */
type Place = { dir: Directory; rel: string[] };

// the names a reader sees at `path`, each with a summary of what is
// there — resolved the way a read is, live — and whether it is the
// place's own: an entry of that directory at or below the name
function Listing(props: {
  ws: Directory;
  probe: Directory;
  path: string[];
  place: Place | undefined;
  walked: string | undefined;
  over: string | undefined;
  surfaceOf: (path: string[]) => string | undefined;
  isCurrent: (id: string) => boolean;
  stick: (id: string, on: boolean) => void;
  setOver: (key: string | undefined) => void;
  go: (path: string[]) => void;
}) {
  const names = from(
    props.ws.list(props.path),
    props.ws.list(props.path).value
  );
  // the value at `path`, for the keys that are fields rather than entries
  let held: Directory | undefined;
  const [opened] = createResource(async () => {
    if (props.path.length === 0) return undefined;
    try {
      return (held = await props.probe.open<unknown>([
        "workspace",
        ...props.path,
      ]));
    } catch {
      return undefined;
    }
  });
  onCleanup(() => held?.close());

  const entries = createMemo(() =>
    props.place
      ? from(props.place.dir.entries, props.place.dir.entries.value)
      : () => []
  );
  const own = (name: string) => {
    const place = props.place;
    if (!place) return false;
    const at = [...place.rel, name];
    return entries()().some((e) => e.handle && startsWith(e.path, at));
  };
  const rows = createMemo(() =>
    names().map((name) => {
      const path = [...props.path, name];
      const resolved = from(
        props.ws.resolve(path),
        props.ws.resolve(path).value
      );
      const inherited = () => !own(name);
      return { name, path, key: path.join("/"), resolved, inherited };
    })
  );
  // inherited entries first, then the ones mounted here, each alphabetical
  const sorted = createMemo(() =>
    [...rows()].sort(
      (a, b) =>
        Number(b.inherited()) - Number(a.inherited()) ||
        a.name.localeCompare(b.name)
    )
  );

  return (
    <div class="entries">
      <For each={sorted()}>
        {({ name, path, key, resolved, inherited }) => {
          const handle = createMemo(
            () =>
              resolved()?.handle ??
              (opened() ? field<unknown>(opened()!, [name]) : undefined)
          );
          const [value, setValue] = createSignal<unknown>();
          createEffect(() => {
            const h = handle();
            if (!h) return setValue(undefined);
            const unsub = h.subscribe((v) => setValue(() => v));
            onCleanup(unsub);
          });
          const below = from(props.ws.list(path), props.ws.list(path).value);
          const folder = () => below().length > 0;
          const surface = props.surfaceOf(path);
          const stuck = () =>
            surface !== undefined &&
            path[path.length - 1] === "document" &&
            props.isCurrent(surface);
          return (
            <div
              class="tree-item"
              data-path={key}
              classList={{
                walked: props.walked === name,
                inherited: inherited(),
                folder: folder(),
                over: props.over === key,
                stuck: stuck(),
              }}
              title={inherited() ? "inherited" : "mounted here"}
              onClick={() => folder() && props.go(path)}
              onDragOver={(e) => {
                if (!surface || !e.dataTransfer?.types.includes(STICKER))
                  return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                props.setOver(key);
              }}
              onDragLeave={() => props.over === key && props.setOver(undefined)}
              onDrop={(e) => {
                if (!surface) return;
                e.preventDefault();
                props.setOver(undefined);
                props.stick(surface, true);
              }}
            >
              <Show when={folder()} fallback={<FileIcon />}>
                <FolderIcon />
              </Show>
              <span class="tree-name">{name}</span>
              <span class="tree-value">
                <Show when={stuck()} fallback={<Summary value={value()} />}>
                  <span class="sticker stuck" title="the current document">
                    <span class="sticker-label">current</span>
                    <button
                      class="sticker-peel"
                      title="peel off: pin the window's own document"
                      onClick={(e) => {
                        e.stopPropagation();
                        props.stick(surface!, false);
                      }}
                    >
                      ×
                    </button>
                  </span>
                </Show>
              </span>
              <Show when={folder()}>
                <span class="tree-more">›</span>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}

function isDirectory(h: Handle<unknown>): h is Directory & Handle<unknown> {
  const d = h as Partial<Directory>;
  return typeof d.list === "function" && typeof d.fork === "function";
}

function startsWith(path: readonly string[], prefix: readonly string[]) {
  return (
    prefix.length <= path.length && prefix.every((name, i) => path[i] === name)
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

// `automerge:4NMNnkMh…` — a URL keeps its scheme and a few id characters
function shorten(name: string): string {
  if (!hasScheme(name) || name.length <= 22) return name;
  const colon = name.indexOf(":");
  return `${name.slice(0, colon + 1)}${name.slice(colon + 1, colon + 9)}…`;
}

function FolderIcon() {
  return (
    <svg class="icon folder-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.5 3.5h4l1.5 2h7.5v7a.5.5 0 0 1-.5.5h-12a.5.5 0 0 1-.5-.5v-9z" />
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

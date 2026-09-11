import { For, from, onCleanup, type Accessor } from "solid-js";
import { render } from "solid-js/web";
import { field, type Directory, type Opened } from "@ninepatch/core";
import type { CanvasDoc } from "../types";

/** The canvas is generic: for every item in its document it forks a
 * directory, mounts a draggable wrapper as `dom` and the item's `docUrl`
 * as a live `document` link, and spawns whatever `componentUrl` names.
 * It owns the collection concerns — position, drag, selection — and
 * knows nothing about what the items are. */
export default async function Canvas(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<CanvasDoc>("document");
  const selection = await dir.open<string | null>("selection");
  const dispose = render(() => {
    const state = from(doc, doc.value);
    return (
      <div
        class="board"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) selection.set(null); // beside the items: clear
        }}
      >
        <For each={Object.keys(state().items)}>
          {(id) => (
            <Item
              id={id}
              dir={dir}
              doc={doc}
              selection={selection}
              state={state}
            />
          )}
        </For>
      </div>
    );
  }, dom.value);
  dir.signal.addEventListener("abort", dispose);
}

function Item(props: {
  id: string;
  dir: Directory;
  doc: Opened<CanvasDoc>;
  selection: Opened<string | null>;
  state: Accessor<CanvasDoc>;
}) {
  const { id } = props;
  const item = () => props.state().items[id];
  const selected = from(props.selection, props.selection.value);

  const drag = (down: PointerEvent) => {
    const target = down.target as HTMLElement;
    if (["INPUT", "BUTTON", "CANVAS", "A"].includes(target.tagName)) return;
    props.selection.set(id);
    const start = item();
    if (!start) return;
    const dx = down.clientX - start.x;
    const dy = down.clientY - start.y;
    const move = (e: PointerEvent) =>
      props.doc.change((d) => {
        const it = d.items[id];
        if (it) {
          it.x = Math.max(0, e.clientX - dx);
          it.y = Math.max(0, e.clientY - dy);
        }
      });
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };

  // The wrapper is the component's whole world: its `dom`, plus its
  // document as a link that re-follows if the docUrl is ever rewritten.
  const el = (
    <div
      class="item"
      classList={{ selected: selected() === id }}
      style={{ left: `${item()?.x ?? 0}px`, top: `${item()?.y ?? 0}px` }}
      onPointerDown={drag}
    />
  ) as HTMLDivElement;

  const child = props.dir.fork(id);
  child.mount("dom", el);
  if (item()?.docUrl)
    child.mount("document", field(props.doc, ["items", id, "docUrl"]));
  else child.unmount("document"); // don't let the canvas's own document leak in
  const process = child.spawn(
    componentName(item()!.componentUrl),
    item()!.componentUrl
  );
  process.terminated.catch((e: unknown) => {
    if (!child.signal.aborted) el.textContent = String(e);
  });
  onCleanup(() => child.close());
  return el;
}

function componentName(url: string): string {
  const base = url
    .split("/")
    .pop()!
    .replace(/\.tsx?$/, "");
  return base[0].toUpperCase() + base.slice(1);
}

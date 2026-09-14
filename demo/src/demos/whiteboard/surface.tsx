import { For, from, onCleanup } from "solid-js";
import { render } from "solid-js/web";
import type { Directory, Opened } from "@ninepatch/core";
import type {
  LocalPointer,
  Shape,
  Stroke,
  SurfaceDoc,
  Tool,
} from "../../types";
import { near, within } from "./geometry";

const line = "./demos/whiteboard/line.tsx";

// What makes a component a surface. It reads `surface` — a directory: the
// document of shapes, with `dom` to draw in and `pointer` in its units
// mounted onto it — and places every shape in it as a component of its
// own: a fork with the wrapper as `dom`, the record as `document`, opened
// through `surface` so whatever the shape mounts onto it lands on the
// surface at `shapes/<id>/…`, and the surface itself as `parent`. While
// the pointer is down on it, it draws with the `tool` selected at the top
// — unless a shape that is itself a surface is under the pointer; that
// one draws.
export async function surface(dir: Directory): Promise<void> {
  const doc = await dir.open<SurfaceDoc>("surface");
  const layer = (await dir.open<HTMLElement>("surface/dom")).value;
  const pointer = await dir.open<LocalPointer>("surface/pointer");
  const tool = await dir.open<Tool>("tool");

  const children = new Map<string, Directory>();
  // a shape that mounted a `surface` of its own takes the pointer over it
  const covered = (p: { x: number; y: number }) =>
    Object.entries(doc.value.shapes).some(
      ([id, s]) =>
        within(s.outline, p.x - s.x, p.y - s.y) &&
        children
          .get(id)
          ?.entries.value.some(
            (e) => e.handle && e.path.join("/") === "surface"
          )
    );

  let stroke: { id: string; x: number; y: number } | undefined;
  const unsubscribe = pointer.subscribe((p) => {
    const t = tool.value;
    if (!p?.down || !t || covered(p)) return void (stroke = undefined);
    if (t.kind === "eraser") {
      const hits = Object.entries(doc.value.shapes)
        .filter(
          ([, s]) =>
            s.componentUrl === line &&
            near(s.outline, p.x - s.x, p.y - s.y, t.width)
        )
        .map(([id]) => id);
      if (hits.length)
        doc.change((d) => {
          for (const id of hits) delete d.shapes[id];
        });
    } else if (!stroke) {
      stroke = { id: crypto.randomUUID(), x: p.x, y: p.y };
      const fresh: Stroke = {
        componentUrl: line,
        x: p.x,
        y: p.y,
        outline: [0, 0],
        color: t.color,
        width: t.width,
      };
      doc.change((d) => (d.shapes[stroke!.id] = fresh));
    } else {
      const { id, x, y } = stroke;
      doc.change((d) =>
        d.shapes[id]?.outline.push(round(p.x - x), round(p.y - y))
      );
    }
  });

  const dispose = render(() => {
    const state = from(doc, doc.value);
    return (
      <For each={Object.keys(state().shapes)}>
        {(id) => {
          const shape = () => state().shapes[id] as Shape | undefined;
          const el = (
            <div
              class="shape"
              style={{
                transform: `translate(${shape()?.x ?? 0}px, ${shape()?.y ?? 0}px)`,
              }}
            />
          ) as HTMLDivElement;

          const child = dir.fork(id);
          children.set(id, child);
          child.mount("dom", el);
          child.mount("id", id);
          child.mount("parent", doc);
          let own: Opened<Shape> | undefined;
          (async () => {
            // through the bind: what the shape mounts onto its document
            // lands on the surface, where everyone reading it can see
            own = await dir.open<Shape>(["surface", "shapes", id]);
            child.mount("document", own);
            const url = own.value.componentUrl;
            child
              .spawn(componentName(url), url)
              .terminated.catch((e: unknown) => {
                if (!child.signal.aborted) el.textContent = String(e);
              });
          })().catch((e: unknown) => {
            if (!child.signal.aborted) el.textContent = String(e);
          });
          onCleanup(() => {
            children.delete(id);
            child.close();
            own?.close();
          });
          return el;
        }}
      </For>
    );
  }, layer);

  dir.signal.addEventListener("abort", () => {
    dispose();
    unsubscribe();
  });
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function componentName(url: string): string {
  const base = url
    .split("/")
    .pop()!
    .replace(/\.tsx?$/, "");
  return base[0].toUpperCase() + base.slice(1);
}

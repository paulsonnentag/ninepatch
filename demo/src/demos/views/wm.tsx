import {
  createEffect,
  createMemo,
  createSignal,
  For,
  from,
  onCleanup,
} from "solid-js";
import { render } from "solid-js/web";
import { field, type Directory } from "@ninepatch/core";
import type { LayoutDoc, LayoutWindow } from "../../types";
import { componentName, tools } from "./tools";

// The window manager. Its document is the arrangement: for every window
// it forks a slot, mounts the frame as `dom` and runs the window's tool
// there. A window that has a document of its own pins it into the slot;
// one marked `current` mounts nothing, so its `document` is whatever the
// directory the layout was placed in has there.
export default async function Wm(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const layout = await dir.open<LayoutDoc>("layout");

  const dispose = render(() => {
    const state = from(layout, layout.value);
    const [front, setFront] = createSignal<string>();
    const edit = (id: string, fn: (w: LayoutWindow) => void) =>
      layout.change((d) => {
        const w = d.windows[id];
        if (w) fn(w);
      });

    // a pointer drag: `move` gets the offset from where it went down
    const track = (
      down: PointerEvent,
      move: (dx: number, dy: number) => void
    ) => {
      down.preventDefault();
      const { clientX, clientY } = down;
      const onMove = (e: PointerEvent) =>
        move(e.clientX - clientX, e.clientY - clientY);
      const stop = () => {
        removeEventListener("pointermove", onMove);
        removeEventListener("pointerup", stop);
      };
      addEventListener("pointermove", onMove);
      addEventListener("pointerup", stop);
    };

    return (
      <div class="wm">
        <For each={Object.keys(state().windows)}>
          {(id) => {
            const win = () => state().windows[id] as LayoutWindow | undefined;
            const body = (<div class="win-body" />) as HTMLDivElement;
            const slot = dir.fork(id);
            slot.mount("dom", body);

            // pinned: the record's own document, held in the slot by a
            // pin — closed when the sticker goes on, and the slot reads
            // `document` from above again
            const pinned = createMemo(() => !win()?.current);
            createEffect(() => {
              if (!pinned()) return;
              const pin = slot.fork("pin");
              pin.mount("slot", slot);
              pin.mount(
                "slot/document",
                field(layout, ["windows", id, "docUrl"])
              );
              onCleanup(() => pin.close());
            });

            // the tool runs for as long as the window names it
            const url = createMemo(() => win()?.componentUrl);
            createEffect(() => {
              const u = url();
              if (!u) return;
              const process = slot.spawn(componentName(u), u);
              process.terminated.catch((e: unknown) => {
                if (!slot.signal.aborted) body.textContent = String(e);
              });
              onCleanup(() => process.dir.close());
            });
            onCleanup(() => slot.close());

            const drag = (e: PointerEvent) => {
              if ((e.target as HTMLElement).tagName === "SELECT") return;
              const start = win();
              if (!start) return;
              track(e, (dx, dy) =>
                edit(id, (w) => {
                  w.x = Math.max(0, start.x + dx);
                  w.y = Math.max(0, start.y + dy);
                })
              );
            };
            const resize = (e: PointerEvent) => {
              const start = win();
              if (!start) return;
              track(e, (dx, dy) =>
                edit(id, (w) => {
                  w.w = Math.max(120, start.w + dx);
                  w.h = Math.max(80, start.h + dy);
                })
              );
            };

            return (
              <div
                class="win"
                classList={{ front: front() === id }}
                style={{
                  left: `${win()?.x ?? 0}px`,
                  top: `${win()?.y ?? 0}px`,
                  width: `${win()?.w ?? 200}px`,
                  height: `${win()?.h ?? 150}px`,
                }}
                onPointerDown={() => setFront(id)}
              >
                <div class="win-title" onPointerDown={drag}>
                  <span class="win-name">{id}</span>
                  <select
                    class="win-tool"
                    value={url()}
                    onChange={(e) =>
                      edit(id, (w) => (w.componentUrl = e.currentTarget.value))
                    }
                  >
                    <For each={tools}>
                      {(tool) => <option value={tool.url}>{tool.name}</option>}
                    </For>
                  </select>
                </div>
                {body}
                <div class="win-grip" onPointerDown={resize} />
              </div>
            );
          }}
        </For>
      </div>
    );
  }, dom.value);
  dir.signal.addEventListener("abort", dispose);
}

import { createSignal, For, from, Show } from "solid-js";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import type { LayoutDoc, LayoutWindow } from "../../types";
import { componentName } from "./tools";

const STICKER = "application/x-ninepatch-current";

// The layout as a folder: one entry per window, its `document` below.
// The sticker at the top is the current document — drag it onto a
// window's `document` and, wherever the layout is used, that window
// shows whatever document the host has. Peel it off to pin the window
// to its own document again.
export default async function Folder(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const layout = await dir.open<LayoutDoc>("layout");

  const dispose = render(() => {
    const state = from(layout, layout.value);
    const [over, setOver] = createSignal<string>();
    const stick = (id: string, on: boolean) =>
      layout.change((d) => {
        const w = d.windows[id];
        if (!w) return;
        if (on) w.current = true;
        else delete w.current;
      });
    return (
      <div class="folder">
        <div class="folder-head">
          <span
            class="sticker"
            draggable
            onDragStart={(e) => {
              e.dataTransfer!.setData(STICKER, "current");
              e.dataTransfer!.effectAllowed = "copy";
            }}
          >
            current document
          </span>
          <span class="folder-hint">drag onto a window's document</span>
        </div>
        <For each={Object.keys(state().windows)}>
          {(id) => {
            const win = () => state().windows[id] as LayoutWindow | undefined;
            return (
              <div class="folder-window">
                <div class="tree-item">
                  <FolderIcon />
                  <span class="tree-name">{id}</span>
                  <span class="tree-value">
                    <code>{componentName(win()?.componentUrl ?? "")}</code>
                  </span>
                </div>
                <div
                  class="tree-item folder-doc"
                  classList={{ over: over() === id, stuck: !!win()?.current }}
                  onDragOver={(e) => {
                    if (!e.dataTransfer?.types.includes(STICKER)) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    setOver(id);
                  }}
                  onDragLeave={() => setOver((o) => (o === id ? undefined : o))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(undefined);
                    stick(id, true);
                  }}
                >
                  <FileIcon />
                  <span class="tree-name">document</span>
                  <Show
                    when={win()?.current}
                    fallback={
                      <span class="tree-value">
                        <code class="url" title={win()?.docUrl}>
                          {shorten(win()?.docUrl ?? "")}
                        </code>
                      </span>
                    }
                  >
                    <span class="sticker stuck">
                      current document
                      <button
                        class="sticker-peel"
                        title="peel off"
                        onClick={() => stick(id, false)}
                      >
                        ×
                      </button>
                    </span>
                  </Show>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    );
  }, dom.value);
  dir.signal.addEventListener("abort", dispose);
}

// `automerge:4NMNnkMh…` — a URL keeps its scheme and a few id characters
function shorten(url: string): string {
  const colon = url.indexOf(":");
  if (colon < 0 || url.length <= 22) return url;
  return `${url.slice(0, colon + 1)}${url.slice(colon + 1, colon + 9)}…`;
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

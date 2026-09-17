import { createMemo, createSignal, For, onCleanup } from "solid-js";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import { moduleUrl } from "../../boot";
import { componentName } from "./windows";

const SIDEBAR = moduleUrl("frame/sidebar.tsx");
const MANAGERS = [
  { label: "tabs", url: moduleUrl("frame/tabs.tsx") },
  { label: "windows", url: moduleUrl("frame/spatial.tsx") },
  { label: "tiled", url: moduleUrl("frame/tiled.tsx") },
];

// the frame is the one program at the root: a picker over a sidebar beside
// a main area, the main area run by whichever manager the picker says
export default async function Frame(dir: Directory) {
  const dom = await dir.open<Element>("dom");

  const dispose = render(() => {
    const [manager, setManager] = createSignal(MANAGERS[0].url);
    // the manager sees the workspace and its element, not the list
    const main = createMemo(() =>
      slot(dir, "manager", manager(), (d) => d.unmount("document"))
    );
    return (
      <>
        <div class="frame-picker">
          <For each={MANAGERS}>
            {(m) => (
              <button
                classList={{ active: manager() === m.url }}
                onClick={() => setManager(m.url)}
              >
                {m.label}
              </button>
            )}
          </For>
        </div>
        <div class="frame-box">
          <aside class="frame-side">{slot(dir, "sidebar", SIDEBAR)}</aside>
          <div class="frame-main">{main()}</div>
        </div>
      </>
    );
  }, dom.value);
  dir.signal.addEventListener("abort", dispose);
}

// a slot runs a componentUrl in a fresh fork, closed with everything it
// spawned when the slot goes
function slot(
  dir: Directory,
  name: string,
  url: string,
  setup?: (child: Directory) => void
): HTMLDivElement {
  const el = (<div class="slot" />) as HTMLDivElement;
  const child = dir.fork(name);
  child.mount("dom", el);
  setup?.(child);
  child.spawn(componentName(url), url).terminated.catch((e: unknown) => {
    if (!child.signal.aborted) el.textContent = String(e);
  });
  onCleanup(() => child.close());
  return el;
}

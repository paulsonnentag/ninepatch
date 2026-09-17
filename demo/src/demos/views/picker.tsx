import { For, from } from "solid-js";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import type { Folder } from "../../types";

// the example documents by name; `picked` is the name, and the host
// derives `document` from it, so a click here rebinds every window that
// takes the current document
export default async function Picker(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const picked = await dir.open<string>("picked");
  const examples = await dir.open<Folder>("examples");

  const dispose = render(() => {
    const current = from(picked, picked.value);
    const names = from(examples, examples.value);
    return (
      <div class="picker">
        <For each={Object.keys(names())}>
          {(name) => (
            <button
              class="pick"
              classList={{ picked: current() === name }}
              onClick={() => picked.set(name)}
            >
              {name}
            </button>
          )}
        </For>
      </div>
    );
  }, dom.value);
  dir.signal.addEventListener("abort", dispose);
}

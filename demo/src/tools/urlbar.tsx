import { For, from } from "solid-js";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import type { Folder, Route } from "../types";

export default async function UrlBar(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const location = await dir.open<Route>("location");
  const demo = await dir.open<Folder>("demo");

  const dispose = render(() => {
    const route = from(location, location.value);
    const known = from(demo, demo.value);
    const go = (url: string) => {
      if (Object.values(known()).includes(url))
        location.set({ ...route(), docUrl: url });
    };
    return (
      <>
        <input
          class="urlbar"
          list="ninepatch-docs"
          value={route().docUrl}
          onChange={(e) => go(e.currentTarget.value)}
        />
        <datalist id="ninepatch-docs">
          <For each={Object.values(known())}>
            {(url) => <option value={url} />}
          </For>
        </datalist>
      </>
    );
  }, dom.value);
  dir.signal.addEventListener("abort", dispose);
}

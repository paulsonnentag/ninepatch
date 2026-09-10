import { For, from } from "solid-js";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import type { Folder, Route } from "../types";

export default async function UrlBar(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const host = await dir.open<string>("host");
  const location = await dir.open<Route>("location");
  const demo = await dir.open<Folder>("demo");

  const dispose = render(() => {
    const route = from(location, location.value);
    const at = from(host, host.value);
    const known = from(demo, demo.value);
    const shown = () => `${at()}/${route().docUrl}`;
    const go = (text: string) => {
      const docUrl = text.startsWith(`${at()}/`)
        ? text.slice(at().length + 1)
        : text;
      if (Object.values(known()).includes(docUrl))
        location.set({ ...route(), docUrl });
    };
    return (
      <>
        <input
          class="urlbar"
          list="ninepatch-docs"
          value={shown()}
          onChange={(e) => go(e.currentTarget.value)}
        />
        <datalist id="ninepatch-docs">
          <For each={Object.values(known())}>
            {(url) => <option value={`${at()}/${url}`} />}
          </For>
        </datalist>
      </>
    );
  }, dom.value);
  dir.signal.addEventListener("abort", dispose);
}

/** §4. The route rendered in the page as an input that looks like a URL
 * bar. It only accepts documents from the seed folder — it opens `demo`
 * and checks. */

import { For, from } from "solid-js";
import { render } from "solid-js/web";
import type { Namespace } from "@ninepatch/core";
import type { Folder, Route } from "../types";

export async function UrlBar(ns: Namespace) {
  const dom = await ns.open<Element>("dom");
  const location = await ns.open<Route>("location");
  const demo = await ns.open<Folder>("demo");

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
  ns.signal.addEventListener("abort", dispose);
}

import { For, from } from "solid-js";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import type { Folder } from "../../types";

const HOST = "ninepatch.org";

export default async function UrlBar(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const url = await dir.open<string>("url");
  const demo = await dir.open<Folder>("demo");

  const dispose = render(() => {
    const path = from(url, url.value);
    const known = from(demo, demo.value);
    const go = (text: string) => {
      let next = text.startsWith(HOST) ? text.slice(HOST.length) : text;
      if (!next.startsWith("/")) next = `/${next}`;
      if (Object.values(known()).includes(next.slice(1))) url.set(next);
    };
    return (
      <>
        <input
          class="urlbar"
          list="ninepatch-docs"
          value={`${HOST}${path()}`}
          onChange={(e) => go(e.currentTarget.value)}
        />
        <datalist id="ninepatch-docs">
          <For each={Object.values(known())}>
            {(u) => <option value={`${HOST}/${u}`} />}
          </For>
        </datalist>
      </>
    );
  }, dom.value);
  dir.signal.addEventListener("abort", dispose);
}

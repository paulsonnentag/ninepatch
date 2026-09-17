import { createEffect, For, on, onCleanup } from "solid-js";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import type { Workspace } from "../../types";
import { watchTitle } from "./describe";
import { manage, slotOf } from "./windows";

// every open document is a tab; the active one is the selection, and
// `tab 2` as a target puts a document in the second one's place
export default async function Tabs(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const ws = manage(dir, await dir.open<Workspace>("workspace"));

  const dispose = render(() => {
    createEffect(
      on(ws.selected, (s, prev) => {
        const at = prev ? slotOf(s.target, "tab") : undefined; // not a stale target from before this manager ran
        if (at !== undefined && s.document) ws.openIn(s, at);
        else ws.ensureOpen(s);
      })
    );
    createEffect(() =>
      ws.publish(
        Object.fromEntries(ws.open().map((d, i) => [`tab ${i + 1}`, [d]]))
      )
    );

    const close = (document: string) => {
      const at = ws.open().indexOf(document);
      ws.close(document, (rest) => rest[at] ?? rest[at - 1]); // the neighbour takes over
    };

    return (
      <div class="tabs">
        <div class="tabs-strip">
          <For each={ws.open()}>
            {(document) => {
              const title = watchTitle(dir, document);
              return (
                <div
                  class="tab"
                  classList={{ active: ws.selected().document === document }}
                  onClick={() => ws.select(document)}
                >
                  <span class="tab-title">{title()}</span>
                  <button
                    class="wm-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      close(document);
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            }}
          </For>
        </div>
        <For each={ws.open()}>
          {(document) => {
            const body = (
              <div
                class="tab-body"
                classList={{ active: ws.selected().document === document }}
              />
            ) as HTMLDivElement;
            const child = ws.mount(document, body);
            onCleanup(() => child.close());
            return body;
          }}
        </For>
      </div>
    );
  }, dom.value);
  dir.signal.addEventListener("abort", dispose);
}

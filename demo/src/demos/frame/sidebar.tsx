import {
  createEffect,
  createMemo,
  createSignal,
  For,
  from,
  onCleanup,
  Show,
} from "solid-js";
import { render } from "solid-js/web";
import { field, type Directory } from "@ninepatch/core";
import type { DocumentsDoc, Selection, Surfaces, Workspace } from "../../types";
import { titleOf, viewOf, watchNote, watchTitle } from "./describe";
import { createNote } from "./documents";
import { live } from "./windows";

type Menu = { document: string; view: string; x: number; y: number };

// the list of documents: click selects one, right-click picks where it
// opens from the surfaces the running manager offers, plus makes a new one
export default async function Sidebar(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const documents = await dir.open<DocumentsDoc>("document");
  const workspace = await dir.open<Workspace>("workspace");
  const selected = field<Selection>(workspace, ["selected"]);
  const surfaces = field<Surfaces>(workspace, ["surfaces"]);

  const dispose = render(() => {
    const list = from(documents, documents.value);
    const current = live(selected, dir.signal);
    const offered = live(surfaces, dir.signal);
    const [menu, setMenu] = createSignal<Menu>();

    const add = () => {
      const url = createNote();
      documents.change((d) => d.documents.push(url));
      selected.set({ document: url, view: viewOf({ type: "markdown" }) });
    };
    const openIn = (m: Menu, target: string) => {
      selected.set({ document: m.document, view: m.view, target });
      setMenu(undefined);
    };

    // a press anywhere but the menu, or escape, closes it
    createEffect(() => {
      if (!menu()) return;
      const close = (e: Event) =>
        (e.target as Element).closest?.(".menu") || setMenu(undefined);
      const key = (e: KeyboardEvent) =>
        e.key === "Escape" && setMenu(undefined);
      addEventListener("pointerdown", close, { capture: true });
      addEventListener("keydown", key);
      onCleanup(() => {
        removeEventListener("pointerdown", close, { capture: true });
        removeEventListener("keydown", key);
      });
    });

    return (
      <div class="sidebar">
        <ul class="sidebar-list">
          <For each={list().documents}>
            {(url) => {
              const note = watchNote(dir, url);
              const label = () => {
                const doc = note();
                return doc === undefined
                  ? "…"
                  : doc === null
                    ? "(missing)"
                    : titleOf(doc);
              };
              const pick = () =>
                selected.set({ document: url, view: viewOf(note() ?? {}) });
              return (
                <li
                  classList={{ selected: current().document === url }}
                  onClick={pick}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const box = e.currentTarget
                      .closest(".sidebar")!
                      .getBoundingClientRect();
                    setMenu({
                      document: url,
                      view: viewOf(note() ?? {}),
                      x: e.clientX - box.left,
                      y: e.clientY - box.top,
                    });
                  }}
                >
                  {label()}
                </li>
              );
            }}
          </For>
        </ul>
        <button class="sidebar-add" title="new note" onClick={add}>
          +
        </button>
        <Show when={menu()}>
          {(m) => (
            <div class="menu" style={{ left: `${m().x}px`, top: `${m().y}px` }}>
              <div class="menu-title">open in</div>
              <For
                each={Object.keys(offered())}
                fallback={<div class="menu-empty">nowhere yet</div>}
              >
                {(name) => {
                  // what is there now, if anything
                  const title = createMemo(() => {
                    const on = offered()[name]?.[0];
                    return on ? watchTitle(dir, on) : () => "";
                  });
                  return (
                    <button class="menu-item" onClick={() => openIn(m(), name)}>
                      <span class="menu-name">{name}</span>
                      <span class="menu-doc">{title()()}</span>
                    </button>
                  );
                }}
              </For>
            </div>
          )}
        </Show>
      </div>
    );
  }, dom.value);
  dir.signal.addEventListener("abort", dispose);
}

import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  Show,
  type Accessor,
  type JSX,
} from "solid-js";
import { createStore, produce } from "solid-js/store";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import type { Workspace } from "../../types";
import { watchTitle } from "./describe";
import { manage } from "./windows";

type Pane = { kind: "pane"; id: number; documents: string[]; active: string };
type Split = {
  kind: "split";
  direction: "row" | "column";
  children: [Node, Node];
};
type Node = Pane | Split;
type Pos = { v?: "top" | "bottom"; h?: "left" | "right" };
type Placed = { pane: Pane; name: string; pos: Pos; path: number[] };
type Offer = { name: string; direction: Split["direction"]; side: 0 | 1 };

// open documents stacked in panes, the panes split from one another and
// named by where they sit; a split a pane could still make is a surface
// with nothing on it, and opening there makes it
export default async function Tiled(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const ws = manage(dir, await dir.open<Workspace>("workspace"));

  const dispose = render(() => {
    let ids = 0;
    const pane = (documents: string[], active = ""): Pane => ({
      kind: "pane",
      id: ++ids,
      documents,
      active: active || documents[documents.length - 1] || "",
    });
    const [tree, setTree] = createStore<{ root: Node }>({
      root: pane([...ws.open()], ws.selected().document),
    });
    const [focused, setFocused] = createSignal((tree.root as Pane).id);
    const placed = createMemo(() => panesOf(tree.root));
    const nameOf = (id: number) =>
      placed().find((p) => p.pane.id === id)?.name ?? "";

    // one body per open document, mounted once and moved between panes
    const [bodies, setBodies] = createStore<Record<string, HTMLDivElement>>({});
    const children = new Map<string, Directory>();
    createEffect(
      on(ws.open, (docs) => {
        for (const d of docs)
          if (!bodies[d]) {
            const el = (<div class="wm-body" />) as HTMLDivElement;
            children.set(d, ws.mount(d, el));
            setBodies(d, el);
          }
        for (const d of Object.keys(bodies))
          if (!docs.includes(d)) {
            children.get(d)?.close();
            children.delete(d);
            setBodies(d, undefined!);
            setTree(
              produce((t) => dropFrom(t, paneWith(t.root, d)?.pane.id, d))
            );
          }
      })
    );
    onCleanup(() => children.forEach((c) => c.close()));

    createEffect(
      on(ws.selected, (s, prev) => {
        if (!s.document) return;
        const target = prev ? s.target : undefined; // not a stale target from before this manager ran
        const here = paneWith(tree.root, s.document);
        const into = target
          ? placed().find((p) => p.name === target)
          : undefined;
        const offer =
          target && !into ? offerNamed(placed(), target) : undefined;
        setTree(
          produce((t) => {
            if (into && into.pane.id !== here?.pane.id) {
              addTo(t, into.pane.id, s.document);
              dropFrom(t, here?.pane.id, s.document);
            } else if (offer && offer.from.pane.documents.length === 0) {
              addTo(t, offer.from.pane.id, s.document); // nothing to split away from
            } else if (offer) {
              splitAt(t, offer.from.pane.id, offer, pane([s.document]));
              dropFrom(t, here?.pane.id, s.document); // a pane left empty folds away
            } else if (!here) {
              addTo(t, focused(), s.document);
            }
            const at = paneWith(t.root, s.document)!;
            at.pane.active = s.document;
          })
        );
        ws.ensureOpen(s);
        setFocused(paneWith(tree.root, s.document)!.pane.id);
      })
    );

    createEffect(() =>
      ws.publish({
        ...Object.fromEntries(
          placed().map((p) => [p.name, [...p.pane.documents]])
        ),
        ...Object.fromEntries(
          placed().flatMap((p) => offersOf(p).map((o) => [o.name, []]))
        ),
      })
    );

    // focus stays in the pane, or goes to the sibling that takes its place
    const close = (document: string) => {
      const here = paneWith(tree.root, document)!;
      const rest = here.pane.documents.filter((d) => d !== document);
      const sibling = siblingOf(tree.root, here.path);
      const next = rest.length
        ? rest[rest.length - 1]
        : sibling && panesOf(sibling)[0].pane.active;
      ws.close(document, () => next || undefined);
    };

    const tile = (node: Accessor<Node>): JSX.Element => (
      <Show
        when={node().kind === "pane"}
        fallback={
          <div class={`tiled-split ${(node() as Split).direction}`}>
            {tile(() => (node() as Split).children[0])}
            {tile(() => (node() as Split).children[1])}
          </div>
        }
      >
        {paneView(node as Accessor<Pane>)}
      </Show>
    );

    // the active document's body is moved in, not re-made, so its editor lives on
    const paneView = (p: Accessor<Pane>): JSX.Element => {
      const body = (<div class="pane-body" />) as HTMLDivElement;
      const empty = (
        <div class="pane-empty">nothing open</div>
      ) as HTMLDivElement;
      createEffect(() => body.replaceChildren(bodies[p().active] ?? empty));
      return (
        <div
          class="pane"
          classList={{ focused: focused() === p().id }}
          onPointerDown={() => {
            if (p().active && ws.selected().document !== p().active)
              ws.select(p().active);
          }}
        >
          <div class="pane-header">
            <span class="pane-name">{nameOf(p().id)}</span>
            <For each={p().documents}>
              {(document) => {
                const title = watchTitle(dir, document);
                return (
                  <div
                    class="tab"
                    classList={{ active: p().active === document }}
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
          {body}
        </div>
      );
    };

    return <div class="tiled">{tile(() => tree.root)}</div>;
  }, dom.value);
  dir.signal.addEventListener("abort", dispose);
}

// --- the tree, named by position -------------------------------------------

function panesOf(node: Node, pos: Pos = {}, path: number[] = []): Placed[] {
  if (node.kind === "pane")
    return [{ pane: node, name: label(pos), pos, path }];
  const [a, b]: [Pos, Pos] =
    node.direction === "row"
      ? [
          { ...pos, h: "left" },
          { ...pos, h: "right" },
        ]
      : [
          { ...pos, v: "top" },
          { ...pos, v: "bottom" },
        ];
  return [
    ...panesOf(node.children[0], a, [...path, 0]),
    ...panesOf(node.children[1], b, [...path, 1]),
  ];
}

function label(pos: Pos): string {
  return [pos.v, pos.h].filter(Boolean).join(" ") || "main";
}

// the splits a pane could make: across the way its parent didn't, so
// every name stays a place
function offersOf(p: Placed): Offer[] {
  const { v, h } = p.pos;
  const offers: Offer[] = [];
  if (!h)
    offers.push(
      { name: label({ v, h: "left" }), direction: "row", side: 0 },
      { name: label({ v, h: "right" }), direction: "row", side: 1 }
    );
  if (!v)
    offers.push(
      { name: label({ v: "top", h }), direction: "column", side: 0 },
      { name: label({ v: "bottom", h }), direction: "column", side: 1 }
    );
  return offers;
}

function offerNamed(
  placed: Placed[],
  name: string
): (Offer & { from: Placed }) | undefined {
  for (const from of placed)
    for (const o of offersOf(from)) if (o.name === name) return { ...o, from };
  return undefined;
}

function paneWith(root: Node, document: string): Placed | undefined {
  return panesOf(root).find((p) => p.pane.documents.includes(document));
}

function paneById(root: Node, id: number | undefined): Placed | undefined {
  return panesOf(root).find((p) => p.pane.id === id);
}

function nodeAt(root: Node, path: number[]): Node {
  return path.reduce((n, i) => (n as Split).children[i], root);
}

function siblingOf(root: Node, path: number[]): Node | undefined {
  if (path.length === 0) return undefined;
  const parent = nodeAt(root, path.slice(0, -1)) as Split;
  return parent.children[1 - path[path.length - 1]];
}

function replaceAt(t: { root: Node }, path: number[], node: Node): void {
  if (path.length === 0) t.root = node;
  else
    (nodeAt(t.root, path.slice(0, -1)) as Split).children[
      path[path.length - 1]
    ] = node;
}

function addTo(t: { root: Node }, id: number, document: string): void {
  const at = paneById(t.root, id) ?? panesOf(t.root)[0];
  if (!at.pane.documents.includes(document)) at.pane.documents.push(document);
  at.pane.active = document;
}

// take a document out of a pane; a pane with nothing left folds into its
// sibling, unless it is the only one
function dropFrom(
  t: { root: Node },
  id: number | undefined,
  document: string
): void {
  const at = paneById(t.root, id);
  if (!at) return;
  at.pane.documents = at.pane.documents.filter((d) => d !== document);
  if (at.pane.active === document)
    at.pane.active = at.pane.documents[at.pane.documents.length - 1] ?? "";
  if (at.pane.documents.length === 0 && at.path.length > 0)
    replaceAt(t, at.path.slice(0, -1), siblingOf(t.root, at.path)!);
}

function splitAt(t: { root: Node }, id: number, offer: Offer, fresh: Pane) {
  const at = paneById(t.root, id)!;
  const children: [Node, Node] =
    offer.side === 0 ? [fresh, at.pane] : [at.pane, fresh];
  replaceAt(t, at.path, {
    kind: "split",
    direction: offer.direction,
    children,
  });
}

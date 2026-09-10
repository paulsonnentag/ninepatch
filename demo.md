# ninepatch: the demo

One HTML page you scroll through. Each section is a paragraph of
explanation, a live example running in the page, and the code that drives
it — the same code, not a copy. Not a test suite; the page is how the
system is explained and how we find out it's wrong.

## Shape

```
ninepatch/
  spec.md
  demo.md
  core/                 createNamespace, Handle, fromDoc, field, derive, NotFound. No DOM, no framework.
  frameworks/
    solid/              useNamespace, createOpen, createValue, tool, Mount
    codemirror/         bindText — CodeMirror 6 ↔ Handle
  demo/
    index.html
    src/
      main.tsx          render the page
      page.tsx          the page: sections, sources, one <Mount> per live example
      boot.ts           repo, seed documents, the origin namespace, the servers (§0)
      route.ts          §4 host: location ↔ hash, selectedDoc as a derived link
      harness.tsx       <Section> = prose + live slot + the section's own source
      types.ts          ContactDoc, ChatDoc, CanvasDoc, …
      tools/
        chat.tsx
        canvas.tsx
        map.tsx
        urlbar.tsx
        markdown.tsx
```

Everything is Solid: the tools are Solid components wrapped by `tool()`,
and the page is a Solid app that forks a namespace per live example,
mounts what that example should see — `dom` included — and calls the tool.
Each tool's source sits next to its slot (Vite `?raw`), so prose and code
can't drift.

Repo: `@automerge/automerge-repo` with `IndexedDBStorageAdapter` and
`BroadcastChannelNetworkAdapter`. That is enough for the page to be live —
open it in two tabs and every example syncs between them — with no server.
A `WebSocketClientAdapter` to a sync server is a one-line addition for
cross-device, later.

Module resolution (loading tools out of automerge documents) is *not* in
the demo. The tools are plain modules in the bundle. The spec already
sketches `modules/…` as a server; the demo is about what a tool can reach
once it's running, and pulling in the loader would bury that.

## The interface

patchwork-next's tool contract (`core/plugins/src/tools.ts`) is
`(handle: DocHandle<T>, element) => cleanup`: the document and a DOM node.
Everything else is either hung off the element (`element.repo`) or a global
(`window.patchwork.account`). The demo doesn't run that contract; §1 shows
the global in two lines and then shows what it can't do.

The demo's contract:

```ts
type Tool = (ns: Namespace) => void
```

A namespace and nothing else. The DOM is an entry (`dom`); the document is
an entry (`doc`); the rest of the tool's world — `user`, `selection`,
`places`, `location` — is siblings. The host assembles that world per tool
with `fork` and `mount`, and fall-through means anything the host mounted
once is visible to every tool it forks. No return value: cleanup hangs off
`ns.on("destroy")`.

The tool's namespace sits one level *above* its document rather than at
it. A namespace sees only what's below it, so a tool positioned at the doc
could reach `user` only if the host re-mounted it beneath every tool's
document node. One level up, `doc` costs one `open` and sharing is free.

## frameworks/solid

Five exports. The whole library is about sixty lines. (Sketch — the
shipped `frameworks/solid/src/index.tsx` is canonical; it adds a
`NamespaceProvider` and guards reads against `NotFound`.)

```tsx
import { createContext, useContext, createResource, createSignal, createMemo, onCleanup, type Accessor, type Resource, type JSX } from "solid-js"
import { render } from "solid-js/web"
import type { Namespace, Handle, Path, Opened } from "@ninepatch/core"   // Opened<T> is the spec's conditional

export type Tool = (ns: Namespace) => void | Promise<void>

const Context = createContext<Namespace>()

/** The namespace this component was rendered under. */
export function useNamespace(): Namespace {
  const ns = useContext(Context)
  if (!ns) throw new Error("no namespace provided")
  return ns
}

/** Open a path under the provided namespace. A Solid resource: undefined
 * while opening, NotFound goes to the nearest <ErrorBoundary>, re-opens
 * when `path` is an accessor and changes, closes what it opened on cleanup. */
export function createOpen<T = never>(path: Path | Accessor<Path>, from = useNamespace()): Resource<Opened<T>> {
  let held: Namespace | undefined
  const release = () => { held?.close(); held = undefined }
  const [opened] = createResource(typeof path === "function" ? path : () => path, async (p) => {
    const next = await from.open<T>(p)
    release(); held = next
    return next
  })
  onCleanup(release)
  return opened
}

/** A handle's value as a signal — from a handle, or from a resource of one
 * (undefined until it's open). Every `change` on the handle is a write. */
export function createValue<T>(source: Handle<T>): Accessor<T>
export function createValue<T>(source: Accessor<Handle<T> | undefined>): Accessor<T | undefined>
export function createValue<T>(source: Handle<T> | Accessor<Handle<T> | undefined>) {
  const handle = typeof source === "function" ? source : () => source
  const value = createMemo(() => {
    const h = handle()
    if (!h) return
    const [get, set] = createSignal(h.value, { equals: false })     // in-place `change` keeps the reference; fire anyway
    onCleanup(h.on("change", () => set(() => h.value)))
    return get
  })
  return () => value()?.()
}

/** A Tool from a component: opens `dom`, renders into it under the
 * namespace, disposes on destroy. */
export function tool(Component: () => JSX.Element): Tool {
  return async (ns) => {
    const dom = await ns.open<Element>("dom")
    const dispose = render(() => <Context.Provider value={ns}><Component /></Context.Provider>, dom.value)
    ns.on("destroy", dispose)
  }
}

/** Host side: a slot that forks the provided namespace, mounts `mount`
 * plus its own element as `dom`, runs the tool, closes on cleanup. */
export function Mount(props: { tool: Tool; mount?: Record<string, unknown>; unmount?: string[] }) {
  const ns = useNamespace().fork()
  const el = (<div class="tool" />) as HTMLDivElement
  for (const [path, what] of Object.entries(props.mount ?? {})) ns.mount(path, what)
  for (const path of props.unmount ?? []) ns.unmount(path)
  ns.mount("dom", el)
  props.tool(ns)
  onCleanup(() => ns.close())
  return el
}
```

A tool, then, looks like

```tsx
export const Counter = tool(() => {
  const doc = createOpen<{ count: number }>("doc")
  const value = createValue(doc)
  return <button onClick={() => doc()!.change((d) => { d.count++ })}>{value()?.count ?? "…"}</button>
})
```

and the host that runs it, like `<Mount tool={Counter} mount={{ doc: url }} />`.
`createValue` is coarse — one signal per handle, re-read on every change.
Solid's `<For>` keys by reference and automerge preserves the identity of
untouched objects, so lists don't re-render wholesale. Fine-grained
tracking (a store fed by patches) is a later addition.

## frameworks/codemirror

CodeMirror 6 for text. `@automerge/automerge-codemirror` is the right tool
and it wants a `DocHandle` — patches and heads — which a `Handle` doesn't
expose (see open questions). Until that's decided, a small binding over the
`Handle` interface does the job for the demo:

```ts
/** Two-way: document → editor as a minimal replace (cursor survives);
 * editor → document through updateText, which splices, so concurrent
 * edits merge instead of clobbering. */
export function bindText(view: EditorView, doc: Handle<unknown>, path: string[]): () => void {
  const pull = () => {
    const next = read(doc.value, path) as string, cur = view.state.doc.toString()
    if (next === cur) return
    const [from, to, insert] = diff(cur, next)                  // common prefix / suffix
    view.dispatch({ changes: { from, to, insert }, annotations: remote.of(true) })
  }
  const push = EditorView.updateListener.of((u) => {
    if (u.docChanged && !u.transactions.some((t) => t.annotation(remote)))
      doc.change((d) => updateText(d, path, u.state.doc.toString()))
  })
  // … attach `push` via a compartment, subscribe `pull`, pull once, return the undo of all three
}
```

## §0 Boot

What every section below stands on. Runs once at the top of the page; the
page shows it as the first section.

Needs:

- A repo (IndexedDB + BroadcastChannel).
- Seed documents, created on first visit and remembered in `localStorage`:
  a `demo` folder `Record<name, url>` pointing at `chat`, `canvas`,
  `notes`, `notes2`, and two contact docs `alice` and `bob`
  (`ContactDoc = { name: string; color: string }`).
- The origin namespace with the repo server on it, from the spec.
- `demo` mounted as a link to the seed folder.

```ts
export const ns = createNamespace()

ns.on("open", async (target, from) => {           // the repo, as a server — verbatim from the spec
  const [url, ...fields] = target
  if (!url.startsWith("automerge:")) return
  if (fields.length === 0) return from.mount(url, fromDoc(await repo.find(url)))
  const doc = await from.open<Record<string, unknown>>(url)
  from.mount(target, field(doc, fields))
})
ns.on("close", (target, from) => {
  if (target[0].startsWith("automerge:")) from.unmount(target)
})

ns.mount("demo", seed.url)                        // a link; demo/chat walks the folder and follows again
export const frame = ns.fork()                    // the page renders under this: <NamespaceProvider ns={frame}>
```

The section renders the folder — `createValue(createOpen<Folder>("demo"))`
— as a list of names and URLs, updating live. The first proof that `open`
on a URL goes to the server, and a folder is just a document whose fields
are links.

## §1 Chat — the global, and the entry

**What it shows.** How a tool finds out who's typing. The old way is a
global; it works, and it can only ever have one answer per page. The new
way is an entry in the tool's namespace, and the host decides what's there
— so the same chat, mounted twice on the same document with a different
`user` in each, is two people in one page. One code path, no props.

**Needs.** `ChatDoc = { messages: { author: string; text: string; at: number }[] }`.
The seed's `alice` and `bob`. A `<Line>` and a `<Form>`.

**The old way** — described, not run: patchwork-next hangs the account off
a global (`window.patchwork.account`), and whoever owns `window` picks the
user, once, for everything on the page.

**The tool.**

```tsx
export const Chat = tool(() => {
  const doc = createOpen<ChatDoc>("doc")
  const user = createOpen<ContactDoc>("user")
  const chat = createValue(doc)
  const me = createValue(user)
  const send = (text: string) =>
    doc()!.change((d) => { d.messages.push({ author: me()!.name, text, at: Date.now() }) })
  return (
    <>
      <For each={chat()?.messages}>{(m) => <Line message={m} mine={m.author === me()?.name} />}</For>
      <Form onSend={send} />
    </>
  )
})
```

**The host** — the part the page is really about:

```tsx
<Mount tool={Chat} mount={{ doc: seed.chat, user: seed.alice }} />   // URLs → links → the repo server
<Mount tool={Chat} mount={{ doc: seed.chat, user: seed.bob }} />     // same doc: repo.find caches, one DocHandle underneath
```

**What to click.** Type on the left; it appears in both, signed Alice.
Type on the right; signed Bob. Rename Alice in the folder section above;
both panes re-render — `me()` reads live through a link.

## §2 Places on a canvas, pins on a map — shared context

**What it shows.** Two tools that have never heard of each other agree
through the namespace. A canvas of cards, some of which carry a location.
A map that shows a pin per location. The map does not know what a canvas
is; it opens `places` and gets a list shaped the way it wants. The host
made `places` by deriving it from the canvas.

**Needs.**

```ts
type CanvasDoc = { cards: Record<string, { x: number; y: number; title: string; lat?: number; lng?: number }> }
type Place = { id: string; title: string; lat: number; lng: number }
```

A canvas tool: absolutely positioned cards, drag to move, click to edit
title/lat/lng. A map: an SVG with a world outline and an equirectangular
projection — no Leaflet, no tiles, nothing to load. The seed canvas comes
with three cards, two of them placed.

**Host.**

```tsx
const canvas = await frame.open<CanvasDoc>("demo/canvas")   // through the folder's link
frame.mount("places", derive(canvas, (d) =>
  Object.entries(d.cards).flatMap(([id, c]) =>
    c.lat != null && c.lng != null ? [{ id, title: c.title, lat: c.lat, lng: c.lng }] : [])))

<Mount tool={Canvas} mount={{ doc: seed.canvas }} />
<Mount tool={Map} />                                          // sees places by fall-through; mounts nothing
```

**Map.**

```tsx
export const Map = tool(() => {
  const places = createValue(createOpen<Place[]>("places"))
  return (
    <svg viewBox="0 0 360 180">
      <World />
      <For each={places() ?? []}>{(p) => <Pin place={p} />}</For>
    </svg>
  )
})
```

**What to click.** Give the third card a lat/lng; a pin appears. Edit a
title; the pin's label follows. Add a card; delete one. `places` is
derived, so it's read-only: `set` on it throws, which is the right answer
— the map can't reach into a document it doesn't know.

**Where this goes.** Today the host names the source (`demo/canvas`). The
next step is a server on `shape/place` that answers by scanning the
documents the requester can reach for objects matching the shape — then
the map opens `shape/place` and the host mounts nothing. The demo stops
before that; the point here is that context is an entry, not a prop.

## §3 Selection — both ways, ephemeral

**What it shows.** The same canvas and map from §2, plus a shared,
unpersisted selection. Click a card, the pin lights up. Click a pin, the
card lights up. Neither tool knows the other exists; both hold the same
`selection` handle. A third slot renders the raw value so you can watch
the file change.

**Needs.** One line in the host. Four lines in each tool.

```ts
frame.mount("selection", null as string | null)   // a plain value; the namespace wraps it. Never touches a document.
```

```tsx
// in Map — and the same in Canvas, against cards
const selection = createOpen<string | null>("selection")
const selected = createValue(selection)
// … per pin:
<g classList={{ selected: selected() === p.id }} onClick={() => selection()!.set(p.id)}>
```

**What to click.** Cards, pins. Then the second map underneath, which the
host gave a private selection —

```tsx
<Mount tool={Map} mount={{ selection: null }} />   // shadows; the canvas and the first map are unaffected
```

— and clicking in it selects nothing anywhere else. The whole "context vs
private state" question is which namespace you called `mount` on.

## §4 The URL is a text field

**What it shows.** The selected document is a link derived from the
route; the route is kept in step with the browser's hash; and the route is
rendered *in the page* as an input that looks like a URL bar. A CodeMirror
editor beneath it opens `selectedDoc` and follows wherever the link
points. Pick a different document in the fake bar, the editor swaps
documents and the real address bar updates. Edit the real hash, the fake
bar updates.

**Needs.** `MarkdownDoc = { content: string }`; the seed's `notes` and
`notes2`. `Route = { docUrl: string }`. A route parser that falls back to
`notes` when the hash is empty or unparseable, so the first `open`
succeeds. The bar only accepts documents from the seed folder (it opens
`demo` and checks) — a target that can't load is out of scope for this
page.

**Host.**

```ts
frame.mount("location", parseHash(window.location.hash))
const location = await frame.open<Route>("location")
addEventListener("hashchange", () => location.set(parseHash(window.location.hash)))
location.on("change", () => history.replaceState(null, "", toHash(location.value)))

frame.mount("selectedDoc", derive(location, (l) => l.docUrl))   // a derived URL is a live link
```

**URL bar.**

```tsx
export const UrlBar = tool(() => {
  const location = createOpen<Route>("location")
  const route = createValue(location)
  const known = createValue(createOpen<Folder>("demo"))
  const go = (url: string) => Object.values(known() ?? {}).includes(url) && location()!.set({ ...route()!, docUrl: url })
  return <input class="urlbar" list="docs" value={route()?.docUrl ?? ""} onChange={(e) => go(e.currentTarget.value)} />
})
```

**Markdown.**

```tsx
export const Markdown = tool(() => {
  const doc = createOpen<MarkdownDoc>("selectedDoc")          // follows the link, and keeps following
  const host = (<div class="editor" />) as HTMLDivElement
  const view = new EditorView({ parent: host, extensions: [basicSetup, markdown()] })
  createEffect(() => { const d = doc(); if (d) onCleanup(bindText(view, d, ["content"])) })
  onCleanup(() => view.destroy())
  return host
})
```

A retarget doesn't re-run the effect: `doc()` is the same namespace, it
just fires `change` with the new document's content, and `bindText` pulls
it in.

**What to click.** Two buttons, "notes" and "notes2", that just set the
hash. The bar, the editor, and the browser's address all move together.
Open the page in a second tab at the other document and type in both.

## Build order

1. `core/` — `createNamespace`, `Handle`, `fromDoc`, `field`, `derive`,
   `NotFound`. Rules 1–9 of the spec. Just enough to run §0.
2. `frameworks/solid/` — the sixty lines above. First consumer of core.
3. `demo/page.tsx` and `boot.ts` — the page with §0 alone. The seed folder
   rendering live is the smoke test for the repo server.
4. §1. First real tool; first use of `<Mount>` as the host's whole job.
5. §2, then §3 — the canvas and map are built once and reused, so §3 is
   mostly prose.
6. `frameworks/codemirror/`, then §4 — first live retarget. Expect this
   section to send changes back into the spec.

## Defaults taken

None of these block; each has a default the demo ships with, and each
becomes a real decision only when something outside this page needs it.

- **CodeMirror binds over `Handle`, not `DocHandle`.** The official
  `automergeSyncPlugin` wants heads and patches, which a `Handle` doesn't
  expose. The demo ships `bindText`: document → editor as a minimal
  prefix/suffix replace (cursor survives), editor → document through
  `updateText` (concurrent edits merge). The cost: a batch of remote edits
  arriving in one tick collapses to one replace, which can bump a cursor
  sitting inside the span. When that matters, the decision is one line —
  expose the `DocHandle` from what `fromDoc` returns, or give `Handle` a
  patch stream.
- **The route falls back to a real document.** A tool whose target doesn't
  exist at first open gets a rejection and nothing to hold — the deferred
  `watch`. §4 sidesteps it by parsing garbage and empty hashes as `notes`,
  so the first `open` always hits. Comes back the first time a tool is
  mounted before its document is created.
- **`places` is derived by hand.** The host names the source
  (`demo/canvas`) and derives the list. The interesting version — a server
  on a shape that indexes whatever the requester can reach — is a second
  demo page, not this one.
- **One signal per handle.** `createValue` re-reads the whole value on
  every change. Solid's `<For>` keys by reference and automerge keeps the
  identity of untouched objects, so lists don't re-render wholesale. The
  fine-grained version is a Solid store fed by automerge patches — the
  same decision as the CodeMirror one: who gets to see patches.

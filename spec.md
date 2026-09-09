# ninepatch

Plan 9's namespace, in the browser, over automerge. Two concepts: a
**namespace** is a position you navigate, mount into, and listen on; a
**handle** is a live grip on a value — read it, write it, hear it change.
Some namespaces are also handles.

## Model

- **A namespace is a position plus a private overlay.** `createNamespace()`
  makes the origin. Every `open` returns a *new* namespace positioned at
  the path it opened; `fork()` returns a new one at the *same* position. A
  namespace sees its own node and everything below it, never above. Reads
  check its own overlay, then fall through — live — to the namespace it
  came from, at the same position. Writes (`mount`, `unmount`) land in its
  own overlay: visible to it and to everything opened or forked from it,
  invisible to its parent and siblings. There is no root and no path
  property; the origin and a deeply opened namespace have the same
  interface and the same powers over what's below them.
- **Value and entries are independent axes.** A node may carry a value and
  may have entries below it; neither implies the other — mounting
  `title/color` under a string is fine. A namespace whose node carries a
  value is also a handle: `Namespace & Handle<T>`. `mount` and `unmount` edit
  the overlay and never write a value; `set` and `change` write the value
  and never edit the overlay. Mount something below an opened document and
  you've added a virtual entry the document never sees.
- **Everything mounted gets a handle.** Mount a plain value and the
  namespace wraps it in a handle of its own; mount a `Handle` and it is
  used as-is. The check is a brand, not a shape: an object that merely
  looks like a handle is data and gets wrapped. Explicit handles are for
  things with their own behavior — a document (`fromDoc(docHandle)`), a
  derivation (`derive(source, fn)`), another namespace.
- **A link is a handle whose value is a URL.** A walk that reaches a string
  with a protocol follows it. Because the link is a handle, retargeting is
  just its value changing; every namespace downstream switches. The
  ambiguity is accepted: a URL-shaped string you meant as data gets
  followed too. To see a link's own value, open its parent and read the
  field.
- **URLs are keys, not paths.** `open`, `mount`, `unmount` take a relative
  path *or* a URL. URL-keyed entries live in a separate area of each
  overlay, reachable only by URL, never enumerable, never by path — so a
  document's subtree never grows a folder of other documents, and no
  namespace can see what others opened unless it knows the URL.
  `automerge:x…/foo` is a URL plus a relative path below it. URL reads fall
  through like everything else: if an ancestor has the doc, you get its
  handle.
- **Misses are requests; unanswered requests are errors.** An open that
  finds nothing bubbles `open` up the chain of namespaces it was opened or
  forked from. A listener answers by mounting into `from` — the requester's
  overlay, seen from the listener's position — and the walk resumes. If
  nobody answers, `open` rejects. Servers are ordinary listeners; the repo
  is one; nothing in the namespace knows what a document is.
- **Handles are live.** A namespace's `value` reads through whatever the
  walk lands on right now — remounts, retargeted links, the handle's own
  changes all arrive as `change`.

## Interface

```ts
/** A live grip on a value. Branded, not duck-typed: things opt in by
 * carrying the symbol, and `mount` checks for it. A DocHandle is the
 * model: `set` replaces, `change` mutates in place, both fire. */
declare const brand: unique symbol           // Symbol.for("ninepatch.handle")
type Handle<T> = {
  readonly [brand]: true
  readonly value: T
  set(next: T): void                          // throws if the handle is read-only
  change(fn: (value: T) => void): void        // throws if the handle is read-only
  on(event: "change", fn: () => void): () => void
}

/** "a/b" or ["a", "b"]. A first name with a scheme is a URL. */
type Path = string | string[]

/** A position: navigate, mount, listen. No value of its own. */
type Namespace = {
  /** Walk down (relative path) or ask for a document (URL). Returns a new
   * namespace positioned there. Name a type and you get a namespace that
   * is also a handle; don't, and you get a bare namespace. Rejects with
   * NotFound once the servers have answered and nothing is there. The
   * empty path throws — use fork(). */
  open<T = never>(path: Path): Promise<[T] extends [never] ? Namespace : Namespace & Handle<T>>

  /** A new namespace at this same position with its own overlay: reads
   * fall through to this one, writes stay in the fork. */
  fork<Self>(this: Self): Self

  /** Into this namespace's overlay. Replaces what this namespace had
   * there. A Handle is used as-is; anything else is wrapped in a new one. */
  mount(path: Path, what: unknown): void
  /** Remove, and cut fall-through at that node — permanently, for this
   * namespace and everything opened or forked from it. Mounting over the
   * cut is allowed. */
  unmount(path: Path): void

  /** The value here was mounted, swapped, removed, or fired. */
  on(event: "change", fn: () => void): () => void
  /** An open at or below here found nothing — from this namespace or
   * anything opened or forked from it. `target`: the names from here to
   * the node the walk is trying to reach; if it went through a link, the
   * first is the URL. `from`: the requester's overlay, seen from here;
   * anything opened through it belongs to the requester and closes with
   * it. Must return a promise. */
  on(event: "open", fn: (target: string[], from: Namespace) => Promise<void>): () => void
  /** The last namespace at or below `target` closed. */
  on(event: "close", fn: (target: string[], from: Namespace) => void): () => void
  /** This namespace was closed — by its holder, or because something it
   * was opened or forked from was. Fires once; afterwards it is dead. */
  on(event: "destroy", fn: () => void): () => void

  /** Release this namespace and everything opened or forked from it. */
  close(): void
}

function createNamespace(): Namespace

class NotFound extends Error { readonly target: string[] }

// Handles for things with their own behavior:
function fromDoc<T>(doc: DocHandle<T>): Handle<T>            // value ← doc(), change ← change, on ← on/off
function field<T>(source: Handle<unknown>, path: string[]): Handle<T>  // a field of source, writes through source.change
function derive<A, B>(source: Handle<A>, fn: (a: A) => B): Handle<B>
```

The types at work:

```ts
const ns = createNamespace()                         // Namespace — no .value
const title = await ns.open<string>("…/title")       // Namespace & Handle<string>
title.value                                          // string
title.fork()                                         // Namespace & Handle<string> — a fork keeps its kind
derive(title, (t) => t.length)                       // a valued namespace is a Handle
```

Two details of the typing: the tuple in `[T] extends [never]` stops
distribution (bare `T extends never` collapses to `never`), and
`fork<Self>(this: Self)` is a `this` *parameter*, which a type literal
allows where a `this` *type* isn't — it is what lets a fork keep its kind.
The brand is `Symbol.for("ninepatch.handle")`, so a handle from another
copy of the library (hot reload, two pins) still counts as one.

At runtime there is one kind of object. Every namespace carries the brand
and a `value` getter; a bare `Namespace` reference simply doesn't expose
it. Naming a type on a node that has entries but no value is a programmer
error: `value` throws.

## Paths and URLs

- A path is a `/`-separated string or an array of names, relative to the
  namespace you call it on. No empty names, no `..`. The empty path — `""`
  or `[]` — is an error; `fork()` is the same-position operation. Handlers
  always receive the array form.
- In string form, `\/` is a literal slash inside a name, `\:` a literal
  colon, `\\` a literal backslash; array names are taken literally.
  Automerge URLs never need any of them (`automerge:x…#h1|h2` is one name).
- A path is a URL when its first name starts with a scheme —
  `^[a-z][a-z0-9+.-]*:` — otherwise it is plain. `automerge:x…` alone names
  a document; `automerge:x…/a/b`, or `["automerge:x…", "a", "b"]`, walks
  into it. `#heads` on the URL is the server's business (a pinned,
  read-only view), not the namespace's.
- Folder documents are `Record<name, url>`, so a folder entry is an
  ordinary URL-valued field: `automerge:home…/packages/core`. Folder
  metadata is ignored for now.

## Rules

1. **Only misses fire `open`.** An open that finds a value, or entries
   below the node, resolves at once and fires nothing. An open that finds
   nothing fires `open` on every listener from the requester up through
   the namespaces it was opened or forked from, nearest first, awaits the
   handlers, re-walks, and either resolves, fires again (a link was
   mounted and followed — a new position), or rejects.
2. **Not-found rejects.** Once the handlers have settled without putting
   anything there, `open` rejects with `NotFound`. A handler that throws
   rejects the open with its error — an unavailable document fails the
   same way it would have loaded. There is no waiting for a late mount; a
   value you hold is a value you have.
3. **Handlers return promises.** Returning anything else throws at the call
   site. Declining is returning from an `async` function. A fire-and-forget
   inside a handler can't be caught: the opener sees `NotFound`, and the
   fill lands for the next opener.
4. **One event per position.** Concurrent opens of the same node from the
   same namespace share one request.
5. **Answers go into `from`.** Fills are per requester overlay; sharing is
   the same handle underneath (`repo.find` caches, so two components
   hold one `DocHandle`). A parent never sees a child's fills. A server
   that wants documents to unload unmounts its fill on `close`.
6. **Unmount cuts, never restores.** Removing your own mount leaves the cut
   too. Requests still bubble through a cut, so a server can refill a path
   — which means a plain mount can be hidden from a child, but a URL can't
   be hidden from a child that knows it.
7. **Held is subtree-inclusive.** A node is held while any namespace at or
   below it is open; `close` fires for it only when the last of those
   goes; `unmount` takes the subtree. Forgotten closes leak; accepted.
8. **Close cascades.** Closing a namespace closes everything opened or
   forked from it, innermost first, and each fires `destroy` once.
   Cleanup that isn't a namespace — DOM, timers, subscriptions — hangs off
   `destroy`; nothing is returned from a component.
9. **Live.** A remount or retarget re-walks from the node, and `change`
   fires when the re-walk settles. Then `value` is whatever is there — and
   if nothing is (a link retargeted to a document the server can't serve,
   an ancestor unmounting what you fell through to), `value` throws until
   something is. No stale value is ever returned.

## Examples

### Boot

```ts
const ns = createNamespace()
ns.mount("dom", document.getElementById("root")!)     // wrapped
ns.mount("location", parseRoute(window.location))     // wrapped; { href, docUrl } — an object, so not a link
ns.mount("account", "automerge:acc…")                 // wrapped; a URL string — a link
```

### The repo, as a server

Registered on the origin so every namespace opened from it is served.
Filters by protocol; walks into documents itself; mounts every field as a
live handle and lets the namespace follow the ones that hold URLs.

```ts
ns.on("open", async (target, from) => {
  const [url, ...fields] = target
  if (!url.startsWith("automerge:")) return

  if (fields.length === 0) {
    from.mount(url, fromDoc(await repo.find(url)))       // "#heads" → read-only view; rejects if unavailable
    return
  }

  const doc = await from.open<Record<string, unknown>>(url)   // a miss the first time: this same handler fills it
  from.mount(target, field(doc, fields))                      // doc is a handle; it closes with the requester
})

ns.on("close", (target, from) => {
  if (target[0].startsWith("automerge:")) from.unmount(target)
})
```

Both mounts are explicit handles because a document has behavior of its
own: `fromDoc` keeps the value live and routes `change` to the `DocHandle`;
`field` reads one field and writes through the document handle's `change`.
A plain `from.mount(url, docHandle.doc())` would mount a snapshot. Deriving
the field from the opened namespace rather than from the document handle
directly means it reads through the requester's overlay live — shadow the
URL below and the field follows. And failure travels the same road as the answer: an
unavailable document rejects `repo.find`, which rejects the handler, which
rejects the open that asked.

### Open, walk, edit

```ts
const home = await ns.open<FolderDoc>("automerge:home…")
const context = await ns.open<Doc>("automerge:home…/packages/core/context")

const title = await ns.open<string>("automerge:x…/title")
title.set("hello")                                    // doc.change(d => d.title = "hello")
title.on("change", () => render(title.value))

const account = await ns.open<AccountDoc>("account")           // link followed: the doc
const rootFolder = await account.open<FolderDoc>("rootFolder") // URL field: followed again
```

### Links are handles: retarget by editing the field that holds it

Opening `rootFolder` follows it. To see or change the link itself, work on
the parent — the link is just a field of the account doc.

```ts
account.value.rootFolder                                   // "automerge:rf…#h1"
account.change((d) => { d.rootFolder = "automerge:other…" }) // rootFolder switches everywhere
```

### The selected document

A derived handle holding a URL is a live link: navigate, and every
namespace through `selectedDoc` follows.

```ts
const location = await ns.open<Route>("location")
addEventListener("hashchange", () => location.set(parseRoute(window.location)))
ns.mount("selectedDoc", derive(location, (l) => l.docUrl))   // a valued namespace is a Handle

const selected = await ns.open<Doc>("selectedDoc")
selected.on("change", () => show(selected.value))     // fires once the new document is served
```

### A component

Components receive a namespace and nothing else. The DOM is an entry. A
child is a `fork()`: same position, private overlay. There is nothing to
return: when whoever handed you the namespace closes it, everything forked
from it closes too, and `destroy` is where the rest of the cleanup goes.

```ts
async function Frame(ns: Namespace) {
  const dom = await ns.open<Element>("dom")
  const slot = dom.value.appendChild(document.createElement("div"))

  const child = ns.fork()
  child.mount("dom", slot)                     // the child renders here
  child.unmount("account")                     // cut for child and below; child can't undo it
  child.mount("selectedDoc", "automerge:other…")   // shadows; Frame's own view unchanged
  Markdown(child)

  ns.on("destroy", () => slot.remove())        // child, and everything Markdown opened, close on their own
}
```

### A capability is just a deep namespace

```ts
Viewer(await ns.open<AccountDoc>("account"))

// inside Viewer(doc: Namespace & Handle<AccountDoc>):
await doc.open<FolderDoc>("rootFolder")   // down: fine
await doc.open<Doc>("automerge:y…")       // by URL: fine — lands in doc's overlay, nobody else sees it
await doc.open("dom")                     // rejects: there is no dom below a document
```

### A branch

Shadow a URL in your overlay and everything below you gets the clone under
the real name — including the server, which reads through `from`.

```ts
const preview = ns.fork()
preview.mount("automerge:x…", fromDoc(clone))
Editor(preview)                    // opens automerge:x…/content, gets the clone's field
```

### Not found

```ts
try {
  await ns.open<Settings>("settings")
} catch (e) {
  if (e instanceof NotFound) console.log(e.target)   // ["settings"]: nothing mounted, no server answered
}

ns.mount("settings", { theme: "dark" })
const settings = await ns.open<Settings>("settings")  // a hit now
```

### Servers answer with anything

```ts
ns.on("open", async ([dir, name], from) => {
  if (dir !== "modules" || name === undefined) return
  const packages = await ns.open<FolderDoc>("account/packages")   // the folder, not the entry
  from.mount(["modules", name], await importPackage(packages.value[name], (u) => repo.find(u)))
})

const { loadComponent } = (await ns.open<SolidPkg>("modules/solid")).value
```

## Accepted trade-offs

- A URL-shaped string meant as data is followed. Store such data in an
  object, or read it from the parent's value.
- A first name with a scheme-shaped prefix reads as a URL. In string form
  escape the colon as `\:`; in array form there is no escape — pick another
  name.
- A held value can be lost (rule 9); `change` fires, then `value` throws.
  Rare, and the same shape as automerge's `doc()` on a deleted document.
- Naming a type on a node that has entries but no value is a programmer
  error the types can't catch: `value` throws.
- A URL can't be revoked from a child that knows it; cutting only hides
  plain mounts.
- Servers must register on an ancestor of what they serve and filter by
  prefix; a listener on a sibling or child namespace hears nothing.
- Folder docs change shape (`Record<name, url>`, no metadata); no
  compatibility with existing folders.

## Deferred

- Listing / directories.
- Read-only handles (a viewer that can't `set`).
- A reactive query for a path that isn't there yet — automerge's
  `findWithProgress` — and with it, replaying pending paths to servers that
  register late.
- Servers for other protocols (`http:`), and whether following `https:`
  strings is a feature.
- Garbage collection beyond `close`.

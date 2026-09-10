# ninepatch

Plan 9's namespace, in the browser, over automerge. Two concepts: a
**directory** is a position you navigate, mount into, and serve; a
**handle** is a live grip on a value — read it, write it, subscribe to it.
Some directories are also handles. (A *folder* is something else: a
document whose fields are URLs. A directory is live and yours; a folder is
data.)

## Model

- **A directory is a position plus a private overlay.** `createDirectory()`
  makes the origin. Every `open` returns a *new* directory positioned at
  the path it opened; `fork()` returns a new one at the *same* position —
  two directories at one path, each with its own overlay. A
  directory sees its own node and everything below it, never above. Reads
  check its own overlay, then fall through — live — to the directory it
  came from, at the same position. Writes (`mount`, `unmount`) land in its
  own overlay: visible to it and to everything opened or forked from it,
  invisible to its parent and siblings. There is no root and no path
  property; the origin and a deeply opened directory have the same
  interface and the same powers over what's below them.
- **Value and entries are independent axes.** A node may carry a value and
  may have entries below it; neither implies the other — mounting
  `title/color` under a string is fine. A directory whose node carries a
  value is also a handle: `Directory & Handle<T>`. `mount` and `unmount` edit
  the overlay and never write a value; `set` and `change` write the value
  and never edit the overlay. Mount something below an opened document and
  you've added a virtual entry the document never sees.
- **Everything mounted gets a handle.** Mount a plain value and the
  directory wraps it in a handle of its own; mount a `Handle` and it is
  used as-is. The check is a brand, not a shape: an object that merely
  looks like a handle is data and gets wrapped. Explicit handles are for
  things with their own behavior — a document (`fromDoc(docHandle)`), a
  derivation (`derive(source, fn)`), another directory.
- **A link is a handle whose value is a URL.** A walk that reaches a string
  with a protocol follows it. Because the link is a handle, retargeting is
  just its value changing; every directory downstream switches. The
  ambiguity is accepted: a URL-shaped string you meant as data gets
  followed too. To see a link's own value, open its parent and read the
  field.
- **URLs are keys, not paths.** `open`, `mount`, `unmount` take a relative
  path *or* a URL. URL-keyed entries live in a separate area of each
  overlay, reachable only by URL, never by path — so a document's subtree
  never grows a folder of other documents. A directory can list its *own*
  overlay (`entries`), URLs included; nobody else's. So no directory can
  see what others opened unless it knows the URL — except the ones it
  opened or forked itself, which it reaches through `children`.
  `automerge:x…/foo` is a URL plus a relative path below it. URL reads fall
  through like everything else: if an ancestor has the doc, you get its
  handle.
- **Misses are requests; unanswered requests are errors.** An open that
  finds nothing asks the servers registered up the chain of directories it
  was opened or forked from. A server answers by mounting into `from` —
  the requester's overlay, seen from the server's position — and the walk
  resumes. If nobody answers, `open` rejects. A server is an object with
  `open` and `close` handed to `serve`; the repo is one; nothing in the
  directory knows what a document is.
- **Handles are live, and a handle is a store.** A directory's `value`
  reads through whatever the walk lands on right now — remounts,
  retargeted links, the handle's own changes all arrive through
  `subscribe`. `subscribe(fn)` is the store contract — `fn(value)` now and
  after every change, returns unsubscribe — so a handle drops into Solid's
  `from()` or Svelte's `$store` with nothing in between. Everything
  observable about a directory is a handle too: `entries` and `children`
  are read-only handles. Lifetime is the platform's: `signal` is an
  `AbortSignal` that aborts on close.

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
  /** The store contract: `fn(value)` now, and after every change. */
  subscribe(fn: (value: T) => void): () => void
}

/** "a/b" or ["a", "b"]. A first name with a scheme is a URL. */
type Path = string | string[]

/** One thing in an overlay. `path` is relative to the directory; a first
 * name with a scheme is a URL. No handle means a cut with nothing mounted
 * over it. */
type Entry = { path: string[]; handle: Handle<unknown> | undefined }

/** What answers requests. `target`: the names from the serving directory
 * to the node the walk is trying to reach; if it went through a link, the
 * first is the URL. `from`: the requester's overlay, seen from the serving
 * directory; anything opened through it belongs to the requester and
 * closes with it. */
type Server = {
  /** An open found nothing there. Must return a promise; decline by
   * returning without mounting. */
  open?(target: string[], from: Directory): Promise<void>
  /** The last directory at or below `target` closed. */
  close?(target: string[], from: Directory): void
}

/** A position: navigate, mount, serve. No value of its own. */
type Directory = {
  /** The name given to fork(); for open(), the path opened; "root" for
   * createDirectory(). A label, nothing more. */
  readonly name: string
  /** This directory's own overlay — what it mounted, was served, or cut.
   * Says nothing about what it inherits. Read-only. */
  readonly entries: Handle<Entry[]>
  /** Everything opened or forked from this directory that is still open.
   * Read-only. */
  readonly children: Handle<Directory[]>
  /** Aborts when this directory is closed — by its holder, or because
   * something it was opened or forked from was. */
  readonly signal: AbortSignal

  /** Walk down (relative path) or ask for a document (URL). Returns a new
   * directory positioned there. Name a type and you get a directory that
   * is also a handle; don't, and you get a bare directory. Rejects with
   * NotFound once the servers have answered and nothing is there. The
   * empty path throws — use fork(). */
  open<T = never>(path: Path): Promise<Opened<T>>

  /** A new directory at this same position with its own overlay: reads
   * fall through to this one, writes stay in the fork. */
  fork<Self>(this: Self, name?: string): Self

  /** Into this directory's overlay. Replaces what this directory had
   * there. A Handle is used as-is; anything else is wrapped in a new one. */
  mount(path: Path, what: unknown): void
  /** Remove, and cut fall-through at that node — permanently, for this
   * directory and everything opened or forked from it. Mounting over the
   * cut is allowed. */
  unmount(path: Path): void

  /** Answer misses at or below here — from this directory or anything
   * opened or forked from it. Returns unregister. */
  serve(server: Server): () => void

  /** Release this directory and everything opened or forked from it. */
  close(): void
}

/** What open resolves to: name a type and the directory is also a handle —
 * `value`, `set`, `change`, `subscribe` come from the handle side. */
type Opened<T> = [T] extends [never] ? Directory : Directory & Handle<T>

function createDirectory(): Directory
/** The URL test — `^[a-z][a-z0-9+.-]*:` — for anyone drawing paths. */
function hasScheme(name: string): boolean

/** What open rejects with, and what `value` throws when nothing is there. */
class NotFound extends Error { readonly target: string[] }

// Handles for things with their own behavior:
function fromDoc<T>(doc: DocHandle<T>, options?: { readOnly?: boolean }): Handle<T>  // value ← doc(), change ← change, subscribe ← on/off
function field<T>(source: Handle<unknown>, path: string[]): Handle<T>  // a field of source, writes through source.change
function derive<A, B>(source: Handle<A>, fn: (a: A) => B): Handle<B>
```

`subscribe` is the one way to hear anything. It is the store contract
Svelte defined and Solid's `from()` consumes: the subscriber is called
synchronously with the current value, then after every change, and gets
back an unsubscribe. So in Solid a handle is `from(doc, doc.value)`; in
Svelte it is `$doc`; nothing framework-shaped lives in core. The one
exception to "synchronously with the current value" is a directory whose
walk currently lands on nothing (rule 9): it stays quiet until something
is there.

The types at work:

```ts
const dir = createDirectory()                         // Directory — no .value
const title = await dir.open<string>("…/title")       // Directory & Handle<string>
title.value                                          // string
title.fork()                                         // Directory & Handle<string> — a fork keeps its kind
derive(title, (t) => t.length)                       // a valued directory is a Handle
```

Two details of the typing: the tuple in `[T] extends [never]` stops
distribution (bare `T extends never` collapses to `never`), and
`fork<Self>(this: Self)` is a `this` *parameter*, which a type literal
allows where a `this` *type* isn't — it is what lets a fork keep its kind.
The brand is `Symbol.for("ninepatch.handle")`, so a handle from another
copy of the library (hot reload, two pins) still counts as one.

At runtime there is one kind of object. Every directory carries the brand
and a `value` getter; a bare `Directory` reference simply doesn't expose
it. Naming a type on a node that has entries but no value is a programmer
error: `value` throws `NotFound` — everywhere `value` has nothing to read,
`NotFound` is what it throws, so a tool can tell "gone" from a bug.

## Paths and URLs

- A path is a `/`-separated string or an array of names, relative to the
  directory you call it on. No empty names, no `..`. The empty path — `""`
  or `[]` — is an error; `fork()` is the same-position operation. Handlers
  always receive the array form.
- In string form, `\/` is a literal slash inside a name, `\:` a literal
  colon, `\\` a literal backslash; array names are taken literally.
  Automerge URLs never need any of them (`automerge:x…#h1|h2` is one name).
- A path is a URL when its first name starts with a scheme —
  `^[a-z][a-z0-9+.-]*:` — otherwise it is plain. `automerge:x…` alone names
  a document; `automerge:x…/a/b`, or `["automerge:x…", "a", "b"]`, walks
  into it. `#heads` on the URL is the server's business (a pinned,
  read-only view), not the directory's.
- Folder documents are `Record<name, url>`, so a folder entry is an
  ordinary URL-valued field: `automerge:home…/packages/core`. Folder
  metadata is ignored for now.

## Rules

1. **Only misses ask the servers.** An open that finds a value, or entries
   below the node, resolves at once and asks nothing. An open that finds
   nothing calls `open` on every server from the requester up through the
   directories it was opened or forked from, nearest first, awaits them,
   re-walks, and either resolves, asks again (a link was mounted and
   followed — a new position), or rejects. Link-following is bounded: a
   walk that crosses more than 32 links — a cycle — is an error, not a
   hang.
2. **Not-found rejects.** Once the servers have settled without putting
   anything there, `open` rejects with `NotFound`. A server that throws
   rejects the open with its error — an unavailable document fails the
   same way it would have loaded. There is no waiting for a late mount; a
   value you hold is a value you have.
3. **Servers return promises.** An `open` returning anything else throws at
   the call site. Declining is returning from an `async` function. A
   fire-and-forget inside a server can't be caught: the opener sees
   `NotFound`, and the fill lands for the next opener.
4. **One request per position.** Concurrent opens of the same node from
   the same directory share one request.
5. **Answers go into `from`.** Fills are per requester overlay; sharing is
   the same handle underneath (`repo.find` caches, so two components
   hold one `DocHandle`). A parent never sees a child's fills. A fill
   outside the requester's subtree throws — a server can only answer into
   the directory that asked. A server that wants documents to unload
   unmounts its fill on `close`.
6. **Unmount cuts, never restores.** Removing your own mount leaves the cut
   too. Requests still bubble through a cut, so a server can refill a path
   — which means a plain mount can be hidden from a child, but a URL can't
   be hidden from a child that knows it.
7. **Held is subtree-inclusive.** A node is held while any directory at or
   below it is open; `close` fires for it only when the last of those
   goes; `unmount` takes the subtree. Forgotten closes leak; accepted.
8. **Close cascades.** Closing a directory closes everything opened or
   forked from it, innermost first, and each one's `signal` aborts once.
   Cleanup that isn't a directory — DOM, timers, subscriptions — hangs off
   the signal, directly (`addEventListener(…, { signal })`) or through an
   `abort` listener; nothing is returned from a component.
9. **Live.** A remount or retarget re-walks from the node, and subscribers
   are called when the re-walk settles on a value. Then `value` is whatever
   is there — and if nothing is (a link retargeted to a document the
   server can't serve, an ancestor unmounting what you fell through to),
   `value` throws `NotFound` and subscribers stay quiet until something
   is. No stale value is ever delivered.
10. **Listing is own-overlay.** `entries` is what this directory put
   there — mounts, served fills (so URLs), cuts — never what it inherits,
   never merged with what a walk would find. `children` is what it opened or forked and
   hasn't closed. Both are read-only handles: labels for a debugger or a
   host, not a walk — nothing in them asks a server — and `subscribe` on
   either says when it changed.

## Examples

### Boot

```ts
const dir = createDirectory()
dir.mount("dom", document.getElementById("root")!)     // wrapped
dir.mount("location", parseRoute(window.location))     // wrapped; { href, docUrl } — an object, so not a link
dir.mount("account", "automerge:acc…")                 // wrapped; a URL string — a link
```

### The repo, as a server

Registered on the origin so every directory opened from it is served.
Filters by protocol; walks into documents itself; mounts every field as a
live handle and lets the directory follow the ones that hold URLs.

```ts
dir.serve({
  async open(target, from) {
    const [url, ...fields] = target
    if (!url.startsWith("automerge:")) return

    if (fields.length === 0) {
      from.mount(url, fromDoc(await repo.find(url)))       // "#heads" → read-only view; rejects if unavailable
      return
    }

    const doc = await from.open<Record<string, unknown>>(url)   // a miss the first time: this same server fills it
    from.mount(target, field(doc, fields))                      // doc is a handle; it closes with the requester
  },
  close(target, from) {
    if (target[0].startsWith("automerge:")) from.unmount(target)
  },
})
```

Both mounts are explicit handles because a document has behavior of its
own: `fromDoc` keeps the value live and routes `change` to the `DocHandle`;
`field` reads one field and writes through the document handle's `change`.
A plain `from.mount(url, docHandle.doc())` would mount a snapshot. Deriving
the field from the opened directory rather than from the document handle
directly means it reads through the requester's overlay live — shadow the
URL below and the field follows. And failure travels the same road as the answer: an
unavailable document rejects `repo.find`, which rejects the server's
`open`, which rejects the open that asked.

### Open, walk, edit

```ts
const home = await dir.open<FolderDoc>("automerge:home…")
const context = await dir.open<Doc>("automerge:home…/packages/core/context")

const title = await dir.open<string>("automerge:x…/title")
title.set("hello")                                    // doc.change(d => d.title = "hello")
title.subscribe((t) => render(t))                     // now, and on every change

const account = await dir.open<AccountDoc>("account")           // link followed: the doc
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
directory through `selectedDoc` follows.

```ts
const location = await dir.open<Route>("location")
addEventListener("hashchange", () => location.set(parseRoute(window.location)))
dir.mount("selectedDoc", derive(location, (l) => l.docUrl))   // a valued directory is a Handle

const selected = await dir.open<Doc>("selectedDoc")
selected.subscribe(show)                              // called again once the new document is served
```

### A component

Components receive a directory and nothing else. The DOM is an entry. A
child is a `fork()`: same position, private overlay; the name is a label
for whoever inspects the tree later. There is nothing to return: when
whoever handed you the directory closes it, everything forked from it
closes too, and `signal` is where the rest of the cleanup goes.

```ts
async function Frame(dir: Directory) {
  const dom = await dir.open<Element>("dom")
  const slot = dom.value.appendChild(document.createElement("div"))

  const child = dir.fork("markdown")
  child.mount("dom", slot)                     // the child renders here
  child.unmount("account")                     // cut for child and below; child can't undo it
  child.mount("selectedDoc", "automerge:other…")   // shadows; Frame's own view unchanged
  Markdown(child)

  dir.signal.addEventListener("abort", () => slot.remove())   // child, and everything Markdown opened, close on their own
}
```

With a framework, the component is the same shape — open what you need,
then hand the handles to the framework as stores:

```tsx
async function Chat(dir: Directory) {
  const dom = await dir.open<Element>("dom")
  const doc = await dir.open<ChatDoc>("doc")
  const dispose = render(() => {
    const chat = from(doc, doc.value)          // Solid's from(): a handle is a store
    return <ul>{chat().messages.map(…)}</ul>
  }, dom.value)
  dir.signal.addEventListener("abort", dispose)
}
```

### Looking at the tree

A host that named its forks can draw them. `entries` is each directory's
own overlay, `children` is what hangs below it — so the picture is the
hierarchy of directories with a table per node. Both are handles, so the
picture redraws by subscribing.

```ts
function draw(dir: Directory, depth = 0) {
  console.log("  ".repeat(depth) + dir.name)
  for (const { path, handle } of dir.entries.value)
    console.log("  ".repeat(depth + 1) + path.join("/"), handle ? handle.value : "(cut)")
  for (const child of dir.children.value) draw(child, depth + 1)
}

const bob = dir.fork("Bob")
bob.mount("dom", slot)
Chat(bob)                                 // opens "doc" — a fill lands in bob's overlay
bob.entries.subscribe(() => draw(dir))     // root › Bob › { dom: <div>, automerge:chat…: {…} }
```

### A capability is just a deep directory

```ts
Viewer(await dir.open<AccountDoc>("account"))

// inside Viewer(doc: Directory & Handle<AccountDoc>):
await doc.open<FolderDoc>("rootFolder")   // down: fine
await doc.open<Doc>("automerge:y…")       // by URL: fine — lands in doc's overlay, nobody else sees it
await doc.open("dom")                     // rejects: there is no dom below a document
```

### A branch

Shadow a URL in your overlay and everything below you gets the clone under
the real name — including the server, which reads through `from`.

```ts
const preview = dir.fork()
preview.mount("automerge:x…", fromDoc(clone))
Editor(preview)                    // opens automerge:x…/content, gets the clone's field
```

### Not found

```ts
try {
  await dir.open<Settings>("settings")
} catch (e) {
  if (e instanceof NotFound) console.log(e.target)   // ["settings"]: nothing mounted, no server answered
}

dir.mount("settings", { theme: "dark" })
const settings = await dir.open<Settings>("settings")  // a hit now
```

### Servers answer with anything

```ts
dir.serve({
  async open([head, name], from) {
    if (head !== "modules" || name === undefined) return
    const packages = await dir.open<FolderDoc>("account/packages")   // the folder, not the entry
    from.mount(["modules", name], await importPackage(packages.value[name], (u) => repo.find(u)))
  },
})

const { loadComponent } = (await dir.open<SolidPkg>("modules/solid")).value
```

## Accepted trade-offs

- A URL-shaped string meant as data is followed. Store such data in an
  object, or read it from the parent's value.
- A first name with a scheme-shaped prefix reads as a URL. In string form
  escape the colon as `\:`; in array form there is no escape — pick another
  name.
- A held value can be lost (rule 9); subscribers go quiet and `value`
  throws `NotFound`. A store fed from it keeps showing the last value it
  was given. Rare, and the same shape as automerge's `doc()` on a deleted
  document.
- Naming a type on a node that has entries but no value is a programmer
  error the types can't catch: `value` throws `NotFound`.
- A URL can't be revoked from a child that knows it; cutting only hides
  plain mounts.
- Servers must register on an ancestor of what they serve and filter by
  prefix; a server on a sibling or child directory hears nothing.
- Folder docs change shape (`Record<name, url>`, no metadata); no
  compatibility with existing folders.

## Deferred

- A merged listing: what a walk would find at a position, through the
  fall-through chain and across links. `entries` is own-overlay only.
- Read-only handles (a viewer that can't `set`).
- A reactive query for a path that isn't there yet — automerge's
  `findWithProgress` — and with it, replaying pending paths to servers that
  register late.
- Servers for other protocols (`http:`), and whether following `https:`
  strings is a feature.
- Garbage collection beyond `close`.

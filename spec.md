# ninepatch

A patchwork inspired by Plan 9. There are 3 concepts:

**directory** is a collection of named things. You can open it, mount into
it, list it, or serve it.

**handle** is a live grip on a value. You can read, write, or subscribe to
it. Some directories are also handles. (A *folder* is something else: a
document whose fields are URLs. A folder is data; a directory is live.)

**process** is a module running in a directory. You can spawn, list, or
kill it.

## How it works

### Directories

A directory is a collection of named things — `dom`, `document`, `user`,
`automerge:x…` — and each name holds a handle. Below a name is whatever
the thing there has below it: the fields of a document, the names of a
bound directory, the keys of an object. You get the first directory from
`createDirectory()`; every other one comes from a directory you already
have, in one of two ways. `open("document")` gives you a directory for
what is at `document`: its names are the things below `document`. `fork()`
gives you a second directory with the same names as the one you forked.

Every directory has a private layer on top of what it came from.
`mount("user", alice)` puts something in *your* directory: you see it, and
so does everything you open or fork from now on; the directory you came
from and its other forks don't. A name you didn't mount shows what the
directory you came from has there, live — if it changes there, it changes
for you. `unmount("account")` removes a name for you and everything below
you, even though the parent still has it. You can never look up: a
directory sees its own names and what is below them, nothing above.

This is what makes a directory the thing you hand to a component. Fork,
mount what it should see, hide what it shouldn't, hand it over. The
component can't tell whether `document` was mounted just for it or
inherited from the page, and it can't reach anything you didn't give it.

Underneath, a directory is exactly three things: its own entries, the
directory it came from, and the path it was opened at inside that
directory — `["document"]` for `open("document")`, `[]` for a fork.
Reading `messages` in a directory opened at `document` looks in its own
entries for `messages`, then asks its parent for `document/messages`,
which looks in its own entries and asks its parent, and so on. Every path
is relative to the directory you ask it of; nothing anywhere holds an
absolute one. That is why you can't look up: there is no address to climb
back to, only a parent you can ask about names below you.

### Mounting

A mount lands where its path *resolves*, not where it was spelled. `mount
("foo/bar", x)` walks `foo` first, and what it finds decides where `bar`
goes:

- Nothing, or a plain value: `foo/bar` goes in your own entries. `mount
  ("foo/bar", a)` and `mount("foo/baz", b)` give you one name, `foo`, with
  `bar` and `baz` below it.
- A link — a name holding a URL: the mount is keyed by the URL. `mount
  ("foo/bar", "automerge:a")`, `mount("lol", "automerge:a")`, then `mount
  ("foo/bar/baz", b)` records `automerge:a/baz` in your entries, and both
  `foo/bar/baz` and `lol/baz` read `b`. The mount is on the document, as
  you see it; it stays with the document if `foo/bar` is later pointed
  elsewhere, and nothing above you or beside you sees it.
- A bind — a name holding a directory: the mount lands in *that*
  directory, at the rest of the path, and everyone reading through it sees
  it. What you put there is taken back when you close.

A directory you opened is a directory at a path, and mounting into it is
mounting at that path: `open("surface")` where `surface` is a bind gives
you a directory that writes into the bound one; `open("document")` where
`document` is a link gives you a directory whose mounts are keyed by the
document's URL — yours alone, so two opens of the same document are two
places to mount things, and a component placed twice doesn't collide with
itself. Plan 9 keys its mount table by the channel mounted on, so `bind X
/b/c` after `bind /a /b` shows up at `/a/c` too; this is the same idea,
with the table kept per directory rather than per process group.

A mount over a document field shadows it for anyone reading through you.
An `unmount` is a *cut*: the name is gone for you and below, whatever the
parent or the document has there, and it never heals — mount over it if
you want it back. A cut made through a view is taken back when the view
closes, like a mount.

### Listing

`list("foo")` is every name a reader of `foo` can see: your entries there,
the parent's, minus cuts, plus the keys of the value there. It never asks
a server, and it never reveals what was cut: listing and `open` agree on
what exists. `entries` is the raw own layer — mounts, fills and cuts, as
paths — for tooling that draws the layers rather than the view.

### Handles

Everything in a directory is a handle: a live grip on a value. `value` is
the current value; `set` replaces it and `change` edits it in place — on a
name whose value is a link, `set` rebinds the name while `change` edits
the target (see Links are handles); `subscribe(fn)` calls `fn` now and
after every change. That is the store contract Svelte defined, so a handle
drops straight into Solid's `from()` or Svelte's `$store`. Mount a plain
value — a DOM element, an object — and the directory wraps it in a handle
for you. Mount something that already is a handle — an automerge document
via `fromDoc`, a derivation via `derive` — and it is used as is, behavior
included. Mount a directory and it is a bind: walks continue inside it.

A directory opened at a name that holds a value is both: `open<ChatDoc>
("document")` is a directory (open `document/messages` from it, mount
into it) and a handle (read, change, subscribe). The two don't interfere:
mounting under a document adds a name the document never sees, and
changing the document never touches what is mounted.

Live means live. If someone above you remounts `document`, or the link you
came through is retargeted, your handle now reads the new thing and your
subscribers hear about it. If there is suddenly nothing there, `value`
throws `NotFound` and subscribers stay quiet until something is there
again. You never get a stale value.

### Links, documents, and values

A handle whose value is a URL is a link. Open a name that holds
`"automerge:x…"` and you get the document, not the string; change the
value and everyone who opened through it switches to the new document. To
see the link itself, read the field on its parent. (This cuts both ways: a
string that merely looks like a URL is followed too.)

Values are walkable. A name holding an object can be opened below by key:
`open("document/messages")` is the `messages` field of the document, live,
and writes through `change` on the document. A field holding a URL is a
link like any other, so `open("account/rootFolder")` is the folder it
names. A key that isn't there is a miss, like a name that isn't there.

URLs are also names in their own right: `open("automerge:x…/title")`
works from any directory, and a URL means the same thing at every level,
so it climbs the chain of parents unchanged. Documents don't turn into
folders, though: a URL you opened is kept aside in your directory,
reachable by that URL and never by walking, so no directory can see what
others opened unless it knows the URL. A *folder* — a document whose
fields are URLs — is how documents point at each other; it is ordinary
data, and opening one of its fields follows the link.

### Servers

Where do documents come from? A directory doesn't know. When you open a
name that isn't there, the request goes up the chain of directories you
came from, growing the path as it climbs — `messages` becomes
`doc/messages` one level up — and any *server* registered along the way
sees the path as it reads from there and may answer by mounting the thing
into your directory. The automerge repo is a server: it answers URLs, whole
documents at a time — a miss inside a document that isn't loaded is a
request for the document, and walking into it is the directory's job. A
host can serve any name it likes — `modules/solid`, `demo/canvas`. If
nobody answers, `open` rejects with `NotFound`; there is no waiting.

### Processes

A process is a module running in a directory. `spawn("Chat", url)` imports
the module at `url` and calls its default export with a directory that has
the same names as the one you spawned in — what it mounts, everyone there
sees — but a lifetime of its own. Killing a process is closing that
directory: everything it opened closes, its `signal` aborts, and the
directory it was spawned in stays. Closing a directory kills what runs in
it. To give a component a directory of its own, fork first, then spawn:
Plan 9's `rfork`, then `exec`.

The URL is anything the platform's `import()` takes, so a process's code is
always nameable: the table can show it, and two hosts spawning the same URL
run the same code. The table of processes — who runs where, what each has
open, and which module — is `/proc`, and only the root has it.
`createDirectory()` returns a `Root` with `processes`; nothing forked or
opened from it does. Keep the root, hand out a fork, and nothing downstream
can see or kill anything but itself.

### Lifetimes

Every directory has a `signal` that aborts when it is closed. Closing a
directory kills its processes, closes everything opened or forked from it,
and takes back what it mounted into other directories through binds. A
directory that was bound somewhere is removed from there when it closes —
removed, not cut, so the name reads as whatever is underneath again.
Cleanup that isn't a directory — DOM, timers, subscriptions — hangs off
the signal. Nothing is ever returned from a component.

## Interface

```ts
/** A live grip on a value. Branded, not duck-typed. A DocHandle is the
 * model: `set` replaces, `change` mutates in place, both fire. */
declare const brand: unique symbol           // Symbol.for("ninepatch.handle")
type Handle<T> = {
  readonly [brand]: true
  readonly value: T
  set(next: T): void                          // throws if read-only
  change(fn: (value: T) => void): void        // throws if read-only
  /** `fn(value)` now, and after every change. Returns unsubscribe. */
  subscribe(fn: (value: T) => void): () => void
}

/** "a/b" or ["a", "b"]. A first name with a scheme is a URL. */
type Path = string | string[]

/** One own entry. No handle: a cut with nothing mounted over it. */
type Entry = { path: string[]; handle: Handle<unknown> | undefined }

/** Where a read landed: the handle there and, when it is an entry rather
 * than a field of a value, the directory that mounted it and the path in
 * its own coordinates. */
type Resolution = {
  handle: Handle<unknown>
  owner: Directory | undefined
  ownerPath: string[] | undefined
}

/** Answers requests. `target`: the missing path as it reads from the
 * serving directory — the requester's path, grown by each level it climbed;
 * through a link, a URL. `from`: the requester's entries seen from here;
 * what is mounted into it belongs to the requester and closes with it. */
type Server = {
  /** An open found nothing there. Must return a promise; decline by
   * returning without mounting. */
  open?(target: string[], from: Directory): Promise<void>
  /** The last directory at or below `target` closed. */
  close?(target: string[], from: Directory): void
}

/** A collection of named things: its own entries, the directory it came
 * from, and the path it was opened at there. */
type Directory = {
  /** fork()'s name, open()'s path joined, or "root". A label. */
  readonly name: string
  /** The path it was opened at — `[]` for a fork or a process view. */
  readonly path: readonly string[]
  /** The raw own layer, for tooling: mounts, fills, cuts. Nothing inherited. */
  readonly entries: Handle<Entry[]>
  /** Opened or forked from here and still open. */
  readonly children: Handle<Directory[]>
  /** Aborts on close — by the holder, or by an ancestor closing. */
  readonly signal: AbortSignal

  /** A new directory for what is at `path` (or at a URL); it remembers
   * the path and reads through this directory. Name a type and the result
   * is also a handle. Rejects with NotFound once the servers have answered
   * and nothing is there. The empty path throws — use fork(). The name
   * is a label for tooling; it defaults to the path. */
  open<T = never>(path: Path, name?: string): Promise<Opened<T>>
  /** A new directory at the empty path: the same names, its own entries.
   * Reads fall through here, writes stay in the fork. */
  fork<Self>(this: Self, name?: string): Self
  /** The names a reader of `path` sees: own and inherited, minus cuts,
   * plus the keys of the value there. Live. Never asks a server. */
  list(path?: Path): Handle<string[]>
  /** For tooling: what a read of `path` lands on, and whose own entry it
   * is — no owner for a field of a value. Live. Never asks a server. */
  resolve(path?: Path): Handle<Resolution | undefined>

  /** Where the path resolves: a Handle as-is, a Directory as a bind,
   * anything else wrapped. Past a link, keyed by the URL in these
   * entries; past a bind, in the bound directory — and taken back when
   * this directory closes. Throws across a link that isn't loaded. */
  mount(path: Path, what: unknown): void
  /** Remove, and cut fall-through there for this directory and everything
   * below it. Mounting over the cut is allowed. */
  unmount(path: Path): void
  /** Answer misses at or below here. Returns unregister. */
  serve(server: Server): () => void

  /** Import the module at `url` and run its default export here, sharing
   * these entries, with its own lifetime. */
  spawn(name: string, url: string): Process
  /** Kill the processes here, close everything opened or forked from
   * here, take back what was mounted through binds. */
  close(): void
}

/** Name a type and the directory is also a handle. */
type Opened<T> = [T] extends [never] ? Directory : Directory & Handle<T>

/** The default export of a module spawn can run. Returning ends nothing;
 * closing `dir` does. */
type Main = (dir: Directory) => Promise<void> | void

/** A directory with a module running in it. */
type Process = {
  readonly pid: string                        // a UUID
  readonly name: string
  readonly url: string                        // the module spawn imported, e.g. "http://…/src/tools/chat.tsx"
  readonly at: Directory                      // where it was spawned; nothing else leads there
  /** What the default export received: the entries of `at`, an empty
   * path, and its own lifetime. `children` is what it opened. `close()`
   * kills; `signal` aborts then. */
  readonly dir: Directory
  /** The default export's return. A failed import or a throw rejects it
   * and kills. */
  readonly terminated: Promise<void>
}

/** The origin, and the only view of the process table. */
type Root = Omit<Directory, "fork"> & {
  fork(name?: string): Directory              // a fork of the root is a Directory: the table does not fork
  readonly processes: Handle<Process[]>       // every process at or below here
}

function createDirectory(options?: {
  /** How spawn loads modules. The platform's import() by default. */
  import?(url: string): Promise<{ default: Main }>
}): Root
/** `^[a-z][a-z0-9+.-]*:` — for anyone drawing paths. */
function hasScheme(name: string): boolean
/** What open rejects with, and what `value` throws when nothing is there. */
class NotFound extends Error { readonly target: string[] }

function fromDoc<T>(doc: DocHandle<T>, options?: { readOnly?: boolean }): Handle<T>
function field<T>(source: Handle<unknown>, path: string[]): Handle<T>   // writes through source.change
/** Read-only unless `write` is given — then a two-way lens over the source. */
function derive<A, B>(source: Handle<A>, fn: (a: A) => B, write?: (b: B) => void): Handle<B>
```

```ts
const dir = createDirectory()                         // Root — no .value
const title = await dir.open<string>("…/title")       // Directory & Handle<string>
title.fork()                                         // keeps its kind
derive(title, (t) => t.length)                       // a valued directory is a Handle
```

Typing notes. `[T] extends [never]` stops distribution; `fork<Self>(this:
Self)` is a `this` parameter, which is how a fork keeps its kind; `Root`
overrides `fork` so the table never leaves the object `createDirectory()`
returned. The brand is `Symbol.for(…)`, so a handle from another copy of
the library still counts. At runtime there is one kind of object: every
directory has a `value` getter, and a bare `Directory` just doesn't expose
it. Wherever `value` has nothing to read it throws `NotFound`, so "gone"
is distinguishable from a bug.

## Paths and URLs

- A path is a `/`-separated string or an array of names, relative to the
  directory. No empty names, no `..`. The empty path is an error; `fork()`
  is how you get a second directory with the same names. Handlers receive
  the array form.
- In string form `\/`, `\:`, `\\` are literal; array names are literal.
  Automerge URLs never need escaping (`automerge:x…#h1|h2` is one name).
- A path is a URL when its first name has a scheme. `automerge:x…` names a
  document; `automerge:x…/a/b` walks into it. `#heads` is the server's
  business (a pinned, read-only view).
- Folder documents are `Record<name, url>`; a folder entry is an ordinary
  URL-valued field. Folder metadata is ignored.

## Resolution

A directory is `{ entries, parent, path }`; `path` is where it was opened
inside `parent`, `[]` for a fork, the URL for a document. Reading `rel`:

1. Look `rel` up in own entries. A handle: go to 3. A cut: stop — nothing
   above is consulted. Otherwise ask `parent` for `path + rel`, and so on
   up. A URL-rooted `rel` is asked as is: a URL reads the same at every
   level.
2. Nothing holds the whole path. Find the longest prefix that holds
   something, here first, then climbing the same way, and continue from it
   with the rest of the path (3). Entries below the path but nothing at it
   or above: a node with entries and no value. Nothing at all: a miss.
3. What a handle is decides what happens next. A link: start again with
   the URL and the rest of the path, from the *base* — the last bind
   entered, else the requester. A directory is a bind: continue inside it
   with the rest, as it reads it — own entries, then its fall-through; it
   is now the base. Anything else, with path left over: step into the
   value by the next key, a live field of it; a key that isn't there is a
   miss. Nothing left over: found. More than 32 links and binds is an
   error.
4. A URL-rooted path not found from the base is looked for from the
   requester too: that is where its fills are.
5. A miss asks the servers (rule 1), climbing from the requester, each
   seeing the path grown to its own level. A miss inside a document that
   isn't loaded is asked as the document. A fill lands in the requester's
   own entries, translated back down by stripping the same prefixes; a
   fill that doesn't start with them is outside the requester's names and
   throws.

`mount(rel, x)` and `unmount(rel)` resolve all of `rel` but its last name
the same way, then write the last name where that landed: after a link,
`url/…/name` in the requester's own entries (or the base's, if a bind came
first); after a bind, `rest/name` in the bound directory; otherwise `rel`
in the requester's own entries. Resolving a prefix across a link into a
document that isn't loaded throws — open it first.

`NotFound.target` is the missing path as the requester wrote it. Nothing
in this needs an absolute path, and there is none.

## Rules

1. **Only misses ask the servers.** An open that finds a value or entries
   resolves at once. One that finds nothing calls `open` on every server
   from the requester up, nearest first, each with the path as it reads
   from there, awaits them, re-reads, and resolves, asks again (a link was
   mounted and followed), or rejects.
2. **Not-found rejects.** Once the servers settle with nothing there,
   `open` rejects with `NotFound`. A server that throws rejects the open
   with its error. There is no waiting for a late mount.
3. **Servers return promises.** Anything else throws at the call site.
   Declining is returning from an `async` function.
4. **One request per name.** Concurrent opens of one node from one
   directory share a request. Every path into a document that isn't
   loaded is one request: the document.
5. **Answers go into `from`.** Fills are per requester; two requesters of
   one document share the `DocHandle` underneath (`repo.find` caches). A
   parent never sees a child's fills. A fill outside the requester's
   subtree throws. A server that wants documents to unload unmounts on
   `close`.
6. **Unmount cuts, never restores.** Removing your own mount leaves the
   cut. Requests still bubble through a cut, so a server can refill a
   path: a plain mount can be hidden from a child, a URL the child knows
   can't. The exception is a cut made through a bind by a directory that
   then closes: that is taken back with its mounts (rule 8).
7. **Held is subtree-inclusive.** A node is held while any directory at or
   below it is open; `close` fires when the last goes; `unmount` takes the
   subtree. Forgotten closes leak.
8. **Close cascades, and takes back.** Closing a directory kills its
   processes, then closes everything opened or forked from it, innermost
   first; each `signal` aborts once. Then every mount and cut it made in
   another directory through a bind is removed — removed, not cut. A
   directory that was itself bound somewhere is removed from there.
   Cleanup that isn't a directory — DOM, timers, subscriptions — hangs off
   the signal.
9. **Live.** A remount or retarget re-walks from the node; subscribers are
   called when it settles on a value. If it settles on nothing, `value`
   throws `NotFound` and subscribers stay quiet until something is there.
   No stale value is ever delivered.
10. **Listing is what a reader sees.** `list(path)` is own and inherited
    names at `path`, minus cuts, plus the keys of the value there — the
    same set `open` would succeed on, short of what a server would fill.
    It never reveals a cut. `entries` is the raw own layer; `children` is
    what this directory opened or forked and hasn't closed. None asks a
    server.
11. **A mount lands where its path resolves.** All but the last name are
    resolved like a read; the last is written where that landed. Past a
    link the mount is keyed by the URL in the mounting directory's
    entries, so every name that reaches the document through it sees the
    mount — and nothing above or beside it does. Past a bind the mount is
    in the bound directory, at the remaining path, for everyone who reads
    through it. Otherwise it is the path as written, in own entries.
    Mounting into an opened directory is mounting at its path, by the
    same rule. Resolving across a link into a document that isn't loaded
    throws.
12. **A mounted directory is a bind.** Walks go through it: reading below
    the name continues inside the bound directory, which answers with its
    own entries and its own fall-through; links met inside restart from
    it. The same directory bound at two names is one object seen twice.
    Unmounting the bind's own name removes the binding (and cuts, rule 6)
    and leaves the bound directory untouched. A bind has no value of its
    own unless the bound directory does. A closed directory reads as
    nothing and is removed from wherever it was bound.
13. **Values are walkable.** A handle whose value is an object can be
    opened below by key: a live field, written through the handle's
    `change`. A field holding a URL is a link. Own entries below the name
    shadow the value's keys; a key that isn't there is a miss.
14. **A process shares its directory and owns its lifetime.** `spawn`
    imports the module at `url` and calls its default export with a
    directory that has the entries of the one it was spawned at — the same
    collection, not a copy — and an empty path; its opens and forks are its
    own `children`. Closing that directory is the kill: its children close,
    its `signal` aborts, its through-mounts are taken back, and it leaves
    the table. The export returning does nothing; a failed import or a
    throw kills, and `terminated` rejects. `root.processes` lists every
    process at or below the root, live; no `Directory` lists any.

## Examples

### Boot

```ts
const root = createDirectory()
root.mount("dom", document.getElementById("root")!)     // wrapped
root.mount("location", { href, docUrl })                 // an object, so not a link
root.mount("account", "automerge:acc…")                  // a URL string — a link
const page = root.fork("page")                           // what everything else gets: no table
```

### The repo, as a server

Filters by protocol and answers whole documents. Walking into them is the
directory's job (rule 13).

```ts
root.serve({
  async open([url, ...fields], from) {
    if (!url.startsWith("automerge:") || fields.length > 0) return
    from.mount(url, fromDoc(await repo.find(url)))       // rejects if unavailable — so does the open
  },
  close([url, ...fields], from) {
    if (url.startsWith("automerge:") && fields.length === 0) from.unmount(url)
  },
})
```

`fromDoc` keeps the value live and routes `change` to the `DocHandle`.
Mounting `doc()` would mount a snapshot.

### Open, walk, edit

```ts
const context = await page.open<Doc>("automerge:home…/packages/core/context")

const title = await page.open<string>("automerge:x…/title")
title.set("hello")                                    // doc.change(d => d.title = "hello")
title.subscribe(render)                               // now, and on every change

const account = await page.open<AccountDoc>("account")           // link followed: the doc
const rootFolder = await account.open<FolderDoc>("rootFolder")   // URL field: followed again
```

### Links are handles

Opening `rootFolder` follows it. The link itself is a field of the parent,
and reads and writes split the way symlinks do: `set` on the opened name
rebinds the link — `ln -sf` — while `change` writes through to the target.

```ts
account.value.rootFolder                                     // "automerge:rf…#h1"
rootFolder.set("automerge:other…")                           // rebinds: the account's field changes
rootFolder.change((d) => { d.name = "renamed" })             // edits the folder it points at
```

A derived handle holding a URL is a live link, and given a write it is a
two-way lens: whoever mounts it owns the encoding, and a `set` on the link
flows back through the source.

```ts
const url = await page.open<string>("url")                   // "/automerge:doc…" — the encoded route
page.mount("document", derive(url, (u) => u.slice(1), (doc) => url.set(`/${doc}`)))
const selected = await page.open<Doc>("document")
selected.subscribe(show)                                     // called again when url changes
selected.set("automerge:other…")                             // rebinds through the lens: url follows
```

### Two names, one document

A mount past a link is on the document, as this directory sees it.

```ts
page.mount("foo/bar", "automerge:a…")
page.mount("lol", "automerge:a…")
page.mount("foo/bar/baz", 1)                 // recorded as automerge:a…/baz
await page.open<number>("lol/baz")           // 1
page.list("lol").value                       // the document's keys, and "baz"
root.open("automerge:a…/baz")                // rejects: the mount is page's
```

### A component is a process

A component is a module whose default export takes a directory and
nothing else; the DOM is an entry. Placing one is `rfork` then `exec`:
`fork()` for a directory of its own, then `spawn` the module's URL into
it. Nothing is returned: closing the directory you were handed closes the
fork, the process, and everything it opened.

```ts
async function Frame(dir: Directory) {
  const dom = await dir.open<Element>("dom")
  const slot = dom.value.appendChild(document.createElement("div"))

  const child = dir.fork("markdown")
  child.mount("dom", slot)
  child.unmount("account")                         // cut for child and below
  child.mount("document", "automerge:other…")     // shadows; Frame's view unchanged
  child.spawn("Markdown", import.meta.resolve("./markdown.ts"))

  dir.signal.addEventListener("abort", () => slot.remove())
}
```

With a framework, the same shape: open what you need, hand the handles over
as stores.

```tsx
export default async function Chat(dir: Directory) {
  const dom = await dir.open<Element>("dom")
  const doc = await dir.open<ChatDoc>("document")
  const dispose = render(() => {
    const chat = from(doc, doc.value)          // a handle is a store
    return <ul>{chat().messages.map(…)}</ul>
  }, dom.value)
  dir.signal.addEventListener("abort", dispose)
}
```

Spawn without forking and the process works in the shared entries. That is
how a host adds a derived entry its components inherit: the derivation is
a process like any other.

```ts
// places.ts
export default async function Places(dir: Directory) {
  const canvas = await dir.open<CanvasDoc>("demo/canvas")
  dir.mount("places", derive(canvas, (d) => pins(d.cards)))   // seen by Canvas and Map
}

// the host
const places = page.fork("places")
places.spawn("Places", import.meta.resolve("./places.ts"))
places.fork("Canvas").spawn("Canvas", import.meta.resolve("./canvas.tsx"))
places.fork("Map").spawn("Map", import.meta.resolve("./map.tsx"))       // opens "places": inherited
```

### A surface: rio, one level at a time

The root has a `pointer` — a recorder writes it, in the board's pixels
— and nothing else. Below it, the canvas is a component that makes its
document a *surface*: a directory, with `dom` and the pointer in its
units mounted onto it, and bound as `surface`. Every shape in it is
placed as a component of its own — a fork with the wrapper as `dom`, the
record as `document`, and the surface as `parent`. The map is one of
those shapes and a surface in turn: it mounts its layer, the pointer in
map units and its `parent` onto its own record, and binds that as
`surface` for the lines below it. From a shape on the map `parent` is
the map, and the map's `parent` is the canvas: the chain leads back up,
level by level. The tools are shapes too. Clicking a pen sets `tool`,
one name at the top; whichever surface the pointer is down on draws with
it in its own units — and a surface leaves the pointer alone while a
shape that mounted a `surface` of its own is under it, so the map takes
the ink when the pointer is over the map.

```ts
// the host: a pointer, and below it a canvas
const root = frame.fork("root")
root.mount("dom", board)
await root.spawn("Input", "./input.ts").terminated       // mounts `pointer`: x, y, down, in the board's pixels
const canvas = root.fork("canvas")
canvas.mount("document", seed.whiteboard)                // a link: the canvas document
canvas.mount("tool", null)                               // the selected pen, for every surface below
canvas.spawn("Canvas", "./canvas.tsx")

// canvas.tsx — a flat surface, in its own pixels
export default async function Canvas(dir: Directory) {
  const doc = await dir.open<SurfaceDoc>("document")
  doc.mount("dom", (await dir.open<HTMLElement>("dom")).value)
  doc.mount("pointer", await dir.open<LocalPointer>("pointer"))
  dir.mount("surface", doc)                              // the document, as a directory: what is on it, and where
  await surface(dir)
}

// surface.tsx — what makes a component a surface
export async function surface(dir: Directory) {
  const doc = await dir.open<SurfaceDoc>("surface")
  const layer = (await dir.open<HTMLElement>("surface/dom")).value
  const pointer = await dir.open<LocalPointer>("surface/pointer")
  const tool = await dir.open<Tool>("tool")              // inherited from the top
  pointer.subscribe((p) => {
    if (!p?.down || !tool.value || covered(p)) return    // covered: a shape with a `surface` of its own is under the pointer
    draw(doc, tool.value, p)                             // a new line, more points on it, or lines removed
  })
  for (const id of Object.keys(doc.value.shapes)) {
    const child = dir.fork(id)
    child.mount("dom", layer.appendChild(wrapperAt(doc.value.shapes[id])))
    child.mount("id", id)
    child.mount("parent", doc)
    const own = await dir.open<Shape>(["surface", "shapes", id])   // through the bind: the record, on the surface
    child.mount("document", own)
    child.spawn(name(own.value.componentUrl), own.value.componentUrl)
  }
}

// map.tsx — a shape that is a surface, in map units
export default async function MapSurface(dir: Directory) {
  const shape = await dir.open<MapShape>("document")
  const outer = await dir.open<LocalPointer>("parent/pointer")   // the surface below's pointer, in its units
  const layer = …                                          // inside dir.open("dom"), transformed with the projection
  shape.mount("dom", layer)                                // onto my record — the canvas sees it at surface/shapes/map/dom
  shape.mount("parent", await dir.open("parent"))
  shape.mount("pointer", derive(outer, (p) => p && toMapUnits(minus(p, shape.value))))
  dir.mount("surface", shape)                              // over the inherited one: from here down, I am the surface
  await surface(dir)
}

// pen.tsx — a shape that is a tool
export default async function Pen(dir: Directory) {
  const doc = await dir.open<Stroke>("document")
  const id = (await dir.open<string>("id")).value
  const tool = await dir.open<Tool>("tool")
  button.onclick = () => tool.set(tool.value?.id === id ? null : { id, kind: "pen", ...doc.value })
}
```

Why the record and not a `wrap`ped value: a mount lands where its path
resolves, and a path into a plain value stops at the value — there is
no table there to land in. A document is a directory, so `pointer`
mounted onto the map's record through `document` resolves through the
child's `surface` bind to the canvas's document and lands in its URL
area at `shapes/map/pointer`, where the canvas, the host and the
inspector all read it. That is also why the child's `document` is opened
through `surface`, not from the surface's own `doc` view: the two spell
different paths to the same record, and only the one through the bind
canonicalises to the shared table.

From the host:

```ts
root.list().value                                                 // ["dom", "pointer"]
canvas.list().value                                               // ["dom", "pointer", "document", "tool", "surface"]
canvas.list("surface").value                                      // ["shapes", "dom", "pointer"]
canvas.list(["surface", "shapes", "map"]).value                   // ["componentUrl", "x", "y", …, "dom", "parent", "pointer"]
(await canvas.open<LocalPointer>("surface/shapes/map/pointer")).value   // the pointer, in map units
```

Two maps on the board are two ids, two forks, two records, two
`pointer`s. Removing a shape closes its fork and its record view; the
mounts made through them go with them, the document's real fields were
never touched, and a shape re-added under the same id starts clean.

### Looking at the tree

`list` is what a reader sees at a name; `children` is what hangs below a
directory; both are handles, so the picture redraws by subscribing.
`entries` draws the layers instead.

```ts
async function draw(dir: Directory, path: string[] = [], depth = 0) {
  for (const name of dir.list(path).value) {
    console.log("  ".repeat(depth) + name)
    await draw(dir, [...path, name], depth + 1)   // mind cycles: a bind can point back up
  }
}

const bob = page.fork("Bob")
bob.mount("dom", slot)
bob.spawn("Chat", import.meta.resolve("./chat.tsx"))   // opens "document" — a fill lands in bob's entries
bob.entries.subscribe((own) => console.log(own))    // [{ path: ["dom"], … }, { path: ["automerge:chat…"], … }]
```

### Processes, as the root sees them

The tree says nothing about who is running where: a process is not a fork.
The root's table does, and only code holding the root can list, inspect,
or kill. `Process.dir.children` is what each has opened; `Process.url` is
the code.

```ts
root.processes.subscribe((ps) => {
  for (const p of ps)
    console.log(p.name, "at", p.at.name, p.url, "open:", p.dir.children.value.map((c) => c.name))
})
// Places at places http://…/places.ts open: ["demo/canvas"]
// Canvas at Canvas http://…/canvas.tsx open: ["dom", "document", "selection"]
// Map at Map http://…/map.tsx open: ["dom", "places", "selection"]

root.processes.value.find((p) => p.name === "Map")?.dir.close()   // its opens close; the Map directory stays
```

### A capability is just a deep directory

```ts
Viewer(await page.open<AccountDoc>("account"))

// inside Viewer(doc: Directory & Handle<AccountDoc>):
await doc.open<FolderDoc>("rootFolder")   // down: fine
await doc.open<Doc>("automerge:y…")       // by URL: fine — lands in doc's entries
await doc.open("dom")                     // rejects: not a key of the document, nothing above it
```

### A branch

Shadow a URL and everything below gets the clone under the real name,
including the server, which reads through `from`.

```ts
const preview = page.fork()
preview.mount("automerge:x…", fromDoc(clone))
Editor(preview)                    // opens automerge:x…/content, gets the clone's field
```

### A bind

A directory mounted under a name is a bind: the same object, seen from a
second place. Reads walk through it, and writes through the name land in
it.

```ts
const map = page.fork("map")
map.mount("pointer", { x: 0, y: 0 })

page.mount("wsys/map", map)                             // a bind, not a copy
const p = await page.open<Pointer>("wsys/map/pointer")  // map's own entry
map.mount("zoom", 3)                                    // appears at wsys/map/zoom, live
page.mount("wsys/map/selected", "shape-1")              // lands in map: everyone reading through the bind sees it

const view = await page.open("wsys/map")                // a directory that writes into map
view.mount("hover", null)                               // in map, until view closes
view.close()                                            // wsys/map/hover is gone; selected stays
page.unmount("wsys/map")                                // drops the binding; map itself is untouched
```

### Not found

```ts
try {
  await page.open<Settings>("settings")
} catch (e) {
  if (e instanceof NotFound) console.log(e.target)   // ["settings"]
}
page.mount("settings", { theme: "dark" })
await page.open<Settings>("settings")                // a hit now
await page.open<string>("settings/theme")            // "dark": values are walkable
```

### Servers answer with anything

```ts
page.serve({
  async open([head, name], from) {
    if (head !== "modules" || name === undefined) return
    const packages = await page.open<FolderDoc>("account/packages")
    from.mount(["modules", name], await importPackage(packages.value[name]))
  },
})
const { loadComponent } = (await page.open<SolidPkg>("modules/solid")).value
```

## Accepted trade-offs

- A URL-shaped string meant as data is followed. Store it in an object, or
  read it from the parent.
- A first name with a scheme-shaped prefix reads as a URL. Escape the colon
  in string form; in array form, pick another name.
- A held value can be lost (rule 9): subscribers go quiet, `value` throws.
  A store fed from it keeps its last value.
- Naming a type on a node with entries but no value is a programmer error
  the types can't catch: `value` throws `NotFound`.
- A URL can't be revoked from a child that knows it.
- A mount past a link stays with the document: retarget the link and the
  mount is not where the new name leads. Mount on the name instead if
  that is what you mean.
- A mount whose path crosses a link into a document that isn't loaded
  throws. `await open(prefix)` first; an opened directory's path is
  already resolved.
- A mount past a bind is in the bound directory for everyone who reads
  through it; two directories bound to the same one share the table. Open
  the document instead of binding a directory if you want a table of your
  own.
- Servers must register on an ancestor of what they serve and filter by
  prefix.
- Folder docs are `Record<name, url>`, no metadata; not compatible with
  existing folders.
- Whoever holds the root sees and can kill every process, and can reach
  into its opens through `Process.dir`. Same as `/proc`; the defence is
  not handing out the root.
- An unforked process's mounts are its directory's. The table says who
  runs there; the entries don't say who put what.
- `list` can't show what a server would fill: a URL nobody opened yet, a
  name only a host server answers.

## Deferred

- Union binds: several directories bound at one name, read in order —
  Plan 9's `MBEFORE`/`MAFTER`. A bind here replaces.
- `..` — walking back out of a bind. There is no address to climb back
  to, and binds only resolve down.
- `Server.list`: letting a server say what it would answer, so `list` can
  show it.
- Read-only handles.
- What a process writes: `children` says what it opened, not what it
  changed or mounted.
- Modules from documents: `spawn` takes what `import()` takes. Running a
  module stored at an `automerge:` URL needs a loader —
  `createDirectory`'s `import` option is the hook.
- A per-subtree process table. Only the root has one.
- A reactive query for a path that isn't there yet, and replaying pending
  paths to servers that register late.
- Servers for other protocols, and whether `https:` strings are followed.
- Garbage collection beyond `close`: a mount keyed by a URL nothing points
  at any more stays in the entries.

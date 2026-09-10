# ninepatch

A patchwork inspired by Plan 9. There are 3 concepts:

**directory** is a collection of named things. You can open it, mount into
it, or serve it.

**handle** is a live grip on a value. You can read, write, or subscribe to
it. Some directories are also handles. (A *folder* is something else: a
document whose fields are URLs. A folder is data; a directory is live.)

**process** is a module running in a directory. You can spawn, list, or
kill it.

## How it works

### Directories

A directory is a collection of named things — `dom`, `doc`, `user`,
`automerge:x…` — and each name holds a handle. You get the first one from
`createDirectory()`; every other directory comes from one you already have,
in one of two ways. `open("doc")` gives you a directory for what is at
`doc`: its names are the things below `doc`. `fork()` gives you a second
directory with the same names as the one you forked.

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
component can't tell whether `doc` was mounted just for it or inherited
from the page, and it can't reach anything you didn't give it.

Underneath, a directory is exactly three things: its own entries, the
directory it came from, and the path it was opened at inside that
directory — `["doc"]` for `open("doc")`, `[]` for a fork. Reading
`messages` in a directory opened at `doc` looks in its own entries for
`messages`, then asks its parent for `doc/messages`, which looks in its own
entries and asks its parent, and so on. Every path is relative to the
directory you ask it of; nothing anywhere holds an absolute one. That is
why you can't look up: there is no address to climb back to, only a parent
you can ask about names below you.

### Handles

Everything in a directory is a handle: a live grip on a value. `value` is
the current value; `set` replaces it and `change` edits it in place;
`subscribe(fn)` calls `fn` now and after every change. That is the store
contract Svelte defined, so a handle drops straight into Solid's `from()`
or Svelte's `$store`. Mount a plain value — a DOM element, an object — and
the directory wraps it in a handle for you. Mount something that already is
a handle — an automerge document via `fromDoc`, a derivation via `derive`,
another directory — and it is used as is, behavior included.

A directory opened at a name that holds a value is both: `open<ChatDoc>
("doc")` is a directory (open `doc/messages` from it, mount below it) and
a handle (read, change, subscribe). The two don't interfere: mounting under
a document adds a name the document never sees, and changing the document
never touches what is mounted.

Live means live. If someone above you remounts `doc`, or the link you came
through is retargeted, your handle now reads the new thing and your
subscribers hear about it. If there is suddenly nothing there, `value`
throws `NotFound` and subscribers stay quiet until something is there
again. You never get a stale value.

### Links and documents

A handle whose value is a URL is a link. Open a name that holds
`"automerge:x…"` and you get the document, not the string; change the
value and everyone who opened through it switches to the new document. To
see the link itself, read the field on its parent. (This cuts both ways: a
string that merely looks like a URL is followed too.)

URLs are also names in their own right: `open("automerge:x…/title")` works
from any directory, and a URL means the same thing at every level, so it
climbs the chain of parents unchanged. Documents don't turn into folders,
though: a URL you opened is kept aside in your directory, reachable by that
URL and never by walking, so no directory can see what others opened unless
it knows the URL. A *folder* — a document whose fields are URLs — is how
documents point at each other; it is ordinary data, and opening one of its
fields follows the link.

### Servers

Where do documents come from? A directory doesn't know. When you open a
name that isn't there, the request goes up the chain of directories you
came from, growing the path as it climbs — `messages` becomes
`doc/messages` one level up — and any *server* registered along the way
sees the path as it reads from there and may answer by mounting the thing
into your directory. The automerge repo is a server: it
answers URLs. A host can serve any name it likes — `modules/solid`,
`demo/canvas`. If nobody answers, `open` rejects with `NotFound`; there is
no waiting.

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
directory kills its processes and closes everything opened or forked from
it. Cleanup that isn't a directory — DOM, timers, subscriptions — hangs off
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
 * from, and the path it was opened at there. No value of its own. */
type Directory = {
  /** fork()'s name, open()'s path joined, or "root". A label. */
  readonly name: string
  /** Own entries only: mounts, fills, cuts. Nothing inherited. */
  readonly entries: Handle<Entry[]>
  /** Opened or forked from here and still open. */
  readonly children: Handle<Directory[]>
  /** Aborts on close — by the holder, or by an ancestor closing. */
  readonly signal: AbortSignal

  /** A new directory for what is at `path` (or at a URL); it remembers
   * the path and reads through this directory. Name a type and the result
   * is also a handle. Rejects with NotFound once the servers have answered
   * and nothing is there. The empty path throws — use fork(). */
  open<T = never>(path: Path): Promise<Opened<T>>
  /** A new directory at the empty path: the same names, its own entries.
   * Reads fall through here, writes stay in the fork. */
  fork<Self>(this: Self, name?: string): Self

  /** Into the own entries, replacing what was there. A Handle is used
   * as-is; anything else is wrapped. */
  mount(path: Path, what: unknown): void
  /** Remove, and cut fall-through at that node for this directory and
   * everything below it. Mounting over the cut is allowed. */
  unmount(path: Path): void
  /** Answer misses at or below here. Returns unregister. */
  serve(server: Server): () => void

  /** Import the module at `url` and run its default export here, sharing
   * these entries, with its own lifetime. */
  spawn(name: string, url: string): Process
  /** Kill the processes here, then close everything opened or forked
   * from here. */
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
function derive<A, B>(source: Handle<A>, fn: (a: A) => B): Handle<B>
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
  is how you get a second directory with the same names. Handlers receive the array form.
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

1. Look `rel` up in own entries. A handle: done. A cut: stop — nothing
   above is consulted. Entries below but no handle: remember that, keep
   going.
2. Otherwise ask `parent` for `path + rel`. A URL-rooted `rel` is asked
   as is: a URL reads the same at every level.
3. A handle whose value is a URL is a link: start again from the
   requester with the URL and the rest of the path. More than 32 links is
   an error.
4. Nothing anywhere, and no entries below: a miss at `rel`. Ask the
   servers (rule 1), climbing the same way, each seeing the path grown to
   its own level. A fill lands in the requester's own entries, translated
   back down by stripping the same prefixes; a fill that doesn't start
   with them is outside the requester's names and throws.

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
   directory share a request.
5. **Answers go into `from`.** Fills are per requester; two
   requesters of one document share the `DocHandle` underneath
   (`repo.find` caches). A parent never sees a child's fills. A fill
   outside the requester's subtree throws. A server that wants documents
   to unload unmounts on `close`.
6. **Unmount cuts, never restores.** Removing your own mount leaves the cut.
   Requests still bubble through a cut, so a server can refill a path: a
   plain mount can be hidden from a child, a URL the child knows can't.
7. **Held is subtree-inclusive.** A node is held while any directory at or
   below it is open; `close` fires when the last goes; `unmount` takes the
   subtree. Forgotten closes leak.
8. **Close cascades.** Closing a directory kills its processes, then closes
   everything opened or forked from it, innermost first; each `signal`
   aborts once. Cleanup that isn't a directory — DOM, timers,
   subscriptions — hangs off the signal.
9. **Live.** A remount or retarget re-walks from the node; subscribers are
   called when it settles on a value. If it settles on nothing, `value`
   throws `NotFound` and subscribers stay quiet until something is there.
   No stale value is ever delivered.
10. **Listing is own entries.** `entries` is what this directory put there,
    never what it inherits or what a read would find. `children` is what
    it opened or forked and hasn't closed. Neither asks a server.
11. **A process shares its directory and owns its lifetime.** `spawn`
    imports the module at `url` and calls its default export with a
    directory that has the entries of the one it was spawned at — the same
    collection, not a copy — and an empty path; its opens and forks are its
    own `children`. Closing that directory is the kill: its children close,
    its `signal` aborts, and it leaves the table. The export returning does
    nothing; a failed import or a throw kills, and `terminated` rejects. `root.processes` lists every process at or
    below the root, live; no `Directory` lists any.

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

Filters by protocol, walks into documents itself, mounts every field as a
live handle; the directory follows the ones that hold URLs.

```ts
root.serve({
  async open(target, from) {
    const [url, ...fields] = target
    if (!url.startsWith("automerge:")) return
    if (fields.length === 0) {
      from.mount(url, fromDoc(await repo.find(url)))       // rejects if unavailable — so does the open
      return
    }
    const doc = await from.open<Record<string, unknown>>(url)   // a miss the first time: this server fills it
    from.mount(target, field(doc, fields))                      // reads through the requester's entries, live
  },
  close(target, from) {
    if (target[0].startsWith("automerge:")) from.unmount(target)
  },
})
```

Both mounts are explicit handles: `fromDoc` keeps the value live and routes
`change` to the `DocHandle`; `field` writes through it. Mounting `doc()`
would mount a snapshot.

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

Opening `rootFolder` follows it. The link itself is a field of the parent.

```ts
account.value.rootFolder                                     // "automerge:rf…#h1"
account.change((d) => { d.rootFolder = "automerge:other…" }) // switches everywhere
```

A derived handle holding a URL is a live link:

```ts
const location = await page.open<Route>("location")
page.mount("selectedDoc", derive(location, (l) => l.docUrl))
const selected = await page.open<Doc>("selectedDoc")
selected.subscribe(show)                               // called again when location changes
```

### A component is a process

A component is a module whose default export takes a directory and
nothing else; the DOM is an entry. Placing one is `rfork` then `exec`:
`fork()` for a directory of its own, then `spawn` the module's URL into
it. Nothing is returned: closing the directory you were
handed closes the fork, the process, and everything it opened.

```ts
async function Frame(dir: Directory) {
  const dom = await dir.open<Element>("dom")
  const slot = dom.value.appendChild(document.createElement("div"))

  const child = dir.fork("markdown")
  child.mount("dom", slot)
  child.unmount("account")                         // cut for child and below
  child.mount("selectedDoc", "automerge:other…")   // shadows; Frame's view unchanged
  child.spawn("Markdown", import.meta.resolve("./markdown.ts"))

  dir.signal.addEventListener("abort", () => slot.remove())
}
```

With a framework, the same shape: open what you need, hand the handles over
as stores.

```tsx
export default async function Chat(dir: Directory) {
  const dom = await dir.open<Element>("dom")
  const doc = await dir.open<ChatDoc>("doc")
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

### Looking at the tree

`entries` is each directory's own, `children` what hangs below it;
both are handles, so the picture redraws by subscribing.

```ts
function draw(dir: Directory, depth = 0) {
  console.log("  ".repeat(depth) + dir.name)
  for (const { path, handle } of dir.entries.value)
    console.log("  ".repeat(depth + 1) + path.join("/"), handle ? handle.value : "(cut)")
  for (const child of dir.children.value) draw(child, depth + 1)
}

const bob = page.fork("Bob")
bob.mount("dom", slot)
bob.spawn("Chat", import.meta.resolve("./chat.tsx"))   // opens "doc" — a fill lands in bob's entries
bob.entries.subscribe(() => draw(page))    // page › Bob › { dom: <div>, automerge:chat…: {…} }
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
// Canvas at Canvas http://…/canvas.tsx open: ["dom", "doc", "selection"]
// Map at Map http://…/map.tsx open: ["dom", "places", "selection"]

root.processes.value.find((p) => p.name === "Map")?.dir.close()   // its opens close; the Map directory stays
```

### A capability is just a deep directory

```ts
Viewer(await page.open<AccountDoc>("account"))

// inside Viewer(doc: Directory & Handle<AccountDoc>):
await doc.open<FolderDoc>("rootFolder")   // down: fine
await doc.open<Doc>("automerge:y…")       // by URL: fine — lands in doc's entries
await doc.open("dom")                     // rejects: nothing above a document
```

### A branch

Shadow a URL and everything below gets the clone under the real name,
including the server, which reads through `from`.

```ts
const preview = page.fork()
preview.mount("automerge:x…", fromDoc(clone))
Editor(preview)                    // opens automerge:x…/content, gets the clone's field
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
- Servers must register on an ancestor of what they serve and filter by
  prefix.
- Folder docs are `Record<name, url>`, no metadata; not compatible with
  existing folders.
- Whoever holds the root sees and can kill every process, and can reach
  into its opens through `Process.dir`. Same as `/proc`; the defence is
  not handing out the root.
- An unforked process's mounts are its directory's. The table says who
  runs there; the entries don't say who put what.

## Deferred

- A merged listing: every name a directory can see, inherited ones included.
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
- Garbage collection beyond `close`.

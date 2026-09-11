# ninepatch

## No essay-style block comments

Don't write multi-line `/** ... */` prose banners above functions or
components, like this:

```tsx
/** The canvas is generic: for every item in its document it forks a
 * directory, mounts a draggable wrapper as `dom` and the item's `docUrl`
 * as a live `document` link, and spawns whatever `componentUrl` names.
 * It owns the collection concerns — position, drag, selection — and
 * knows nothing about what the items are. */
export default async function Canvas(dir: Directory) {
```

The code should speak for itself. If a line genuinely needs explaining,
a short single-line `//` comment at that line is fine.

## Sub-components take a directory, nothing else

A sub-component's entire interface is its `Directory`. Don't thread
extra props (docs, signals, accessors, ids) through from the parent —
fork a child directory, mount what the child needs into it, and let the
child open/read everything from there.

```tsx
// Bad: parent leaks its internals into the child as props
<Item id={id} dir={dir} doc={doc} selection={selection} state={state} />

// Good: the child gets one directory and reads its world from it
const child = dir.fork(id);
child.mount("dom", el);
child.mount("document", field(doc, ["items", id, "docUrl"]));
<Item dir={child} />
```

## Use Solid by default

When an example needs reactivity or rendering, reach for Solid
(`solid-js`) unless there's a specific reason to use something else.

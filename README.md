# ninepatch

A patchwork inspired by Plan 9: namespaces in the browser, over
[automerge](https://automerge.org/). There are three concepts.

**directory** — a collection of named things. You can open it, mount into
it, list it, or serve it.

**handle** — a live grip on a value. You can read, write, or subscribe to
it. Some directories are also handles.

**process** — a module running in a directory. You can spawn, list, or
kill it.

A component's entire interface is the directory it is handed. Fork one,
mount what the component should see, hide what it shouldn't, hand it over:
it can't tell whether `document` was mounted just for it or inherited from
the page, and it can't reach anything you didn't give it.

[**Live demo**](https://paulsonnentag.github.io/ninepatch/) — open it in a
second tab and everything syncs.

## The demos

Each one is a working page plus the source of every tool it spawns.

- **Todos** — the smallest case: one directory holding one document, a
  todo tool spawned in it.
- **The same document, on a terminal** — that todo document opened by a
  program with no `dom` at all. It reads `keyboard` and writes `screen`,
  and the host mounts those two where it would otherwise mount an element.
- **Chat** — one tool mounted twice on the same document with a different
  `user` entry each time, so who is typing is decided by the host instead
  of a global.
- **Canvas and map** — the document stores a `componentUrl`, a `docUrl`
  and a position per item, so the canvas drags wrappers and spawns
  whatever the document names.
- **Whiteboard** — Rio, one level at a time: surfaces are logical, every
  shape is a component of its own, and the map is a shape that is a
  surface in turn.
- **The URL is a text field** — a `Route` process mounts `document` as a
  two-way lens over the url, so the bar only writes the url and the editor
  only rebinds the doc.

## Layout

```
core/                 the directory, handle and path implementation
frameworks/codemirror a codemirror binding
demo/                 the demo page and its tools
spec.md               the design in full — start here to understand why
```

## Development

Requires [pnpm](https://pnpm.io/).

```sh
pnpm install
pnpm dev           # the demo page, on vite
pnpm typecheck
pnpm format
```

Pushing to `main` builds the demo and publishes it to GitHub Pages.

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

[**Live demo**](https://paulsonnentag.github.io/ninepatch/) — a page of
working examples, each beside an inspector of the directories it runs in.
Open it in a second tab and everything syncs.

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

Pushing to `main` builds the demo and publishes it to GitHub Pages. Every
other branch is published too, as a preview at
`/ninepatch/preview/<branch>/` with the `/` in the branch name turned into
`-`.

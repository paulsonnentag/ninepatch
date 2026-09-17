import { ErrorBoundary, For, lazy, Suspense, type Component } from "solid-js";
import { Placeholder } from "./placeholder";

// every demo is its own module, loaded on its own: the page shows at
// once with a placeholder per demo, and each fills in as its documents
// arrive — one that is slow or fails holds up nothing else
//
// boot — the wasm, the repo, the seed — is imported once, on its own, and
// the demos only after it has finished: they all import it, and Safari
// runs a module whose dependency is still awaiting at its top level
// before that dependency is done when the imports race, so the demos saw
// boot's exports uninitialized
const booted = import("./boot");
const after =
  <T,>(load: () => Promise<T>) =>
  () =>
    booted.then(load);

const DEMOS: { title: string; load: () => Promise<Component> }[] = [
  {
    title: "Chat",
    load: after(() => import("./demos/chat").then((m) => m.ChatDemo)),
  },
  {
    title: "Canvas",
    load: after(() => import("./demos/canvas").then((m) => m.CanvasDemo)),
  },
  {
    title: "Window management",
    load: after(() => import("./demos/frame").then((m) => m.FrameDemo)),
  },
  {
    title: "An arrangement of windows is a view",
    load: after(() => import("./demos/views").then((m) => m.ViewsDemo)),
  },
  {
    title: "Whiteboard",
    load: after(() =>
      import("./demos/whiteboard").then((m) => m.WhiteboardDemo)
    ),
  },
  {
    title: "RSS feed",
    load: after(() => import("./demos/feeds").then((m) => m.FeedsDemo)),
  },
  {
    title: "Todos",
    load: after(() => import("./demos/todos").then((m) => m.TodosDemo)),
  },
];

export function Page() {
  return (
    <>
      <header>
        <h1>ninepatch</h1>
        <p>
          Plan 9's namespace, in the browser, over automerge: a <b>directory</b>{" "}
          is a collection of named things you mount into and listen on, a{" "}
          <b>handle</b> is a live grip on a value, and a <b>process</b> is a
          module running in a directory. Open this page in a second tab and
          everything syncs.
        </p>
      </header>

      <For each={DEMOS}>{(demo) => <Demo {...demo} />}</For>
    </>
  );
}

function Demo(props: { title: string; load: () => Promise<Component> }) {
  const Section = lazy(() => props.load().then((c) => ({ default: c })));
  return (
    <ErrorBoundary
      fallback={(e) => <Placeholder title={props.title} error={e} />}
    >
      <Suspense fallback={<Placeholder title={props.title} />}>
        <Section />
      </Suspense>
    </ErrorBoundary>
  );
}

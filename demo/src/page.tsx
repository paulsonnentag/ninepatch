/** The page: four sections, each a sentence, a live example, the code
 * behind it, and the directories it runs in. Every section gets its own
 * named fork of the page's directory, and everything that runs — the
 * tools, the host's own derivations — is a process spawned there, so the
 * data panel shows exactly that section's world: windows for directories,
 * nodes beside them for what runs in them. */

import { frame, moduleUrl, seed } from "./boot";
import { createComponent, Section } from "./harness";
import todosSource from "./tools/todos.tsx?raw";
import chatSource from "./tools/chat.tsx?raw";
import canvasSource from "./tools/canvas.tsx?raw";
import placeSource from "./tools/place.tsx?raw";
import mapSource from "./tools/map.tsx?raw";
import placesSource from "./tools/places.ts?raw";
import routeSource from "./tools/route.ts?raw";
import urlbarSource from "./tools/urlbar.tsx?raw";
import markdownSource from "./tools/markdown.tsx?raw";

// --- host: one fork per section, and what runs there before rendering --------

const todos = frame.fork("todos");

const chat = frame.fork("chat");

const root = frame.fork("root"); // "root" loosely: the canvas section's world
root.mount("selection", null as string | null); // a plain value; never touches a document
await root.spawn("Places", moduleUrl("places.ts")).terminated; // follows the items' docs, mounts `places`

const browser = frame.fork("browser");
await browser.spawn("Route", moduleUrl("route.ts")).terminated; // mounts `url` and `selectedDoc`

// --- the tools, as components: every extra prop is a mounted entry -----------

const Todos = createComponent<{ doc: string }>(moduleUrl("todos.tsx"));
const Chat = createComponent<{ doc: string; user: string }>(
  moduleUrl("chat.tsx")
);
const Canvas = createComponent<{ doc: string }>(moduleUrl("canvas.tsx"));
const UrlBar = createComponent(moduleUrl("urlbar.tsx"));
const Markdown = createComponent(moduleUrl("markdown.tsx"));

// --- the page -----------------------------------------------------------------

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

      <Section
        title="Todos"
        chain={[frame, todos]}
        sources={[{ name: "todos.tsx", code: todosSource }]}
        prose={
          <p>
            The smallest case: one directory holding one document, a todo tool
            spawned in it, and ticking a box in a second tab ticks it here too.
          </p>
        }
      >
        <Todos dir={todos} doc={seed.todos} />
      </Section>

      <Section
        title="Chat"
        chain={[frame, chat]}
        sources={[{ name: "chat.tsx", code: chatSource }]}
        prose={
          <p>
            The same chat tool is mounted twice on the same document with a
            different <code>user</code> entry each time, so who is typing is
            decided by the host instead of a global.
          </p>
        }
      >
        <div class="row">
          <Chat dir={chat} name="Alice" doc={seed.chat} user={seed.alice} />
          <Chat dir={chat} name="Bob" doc={seed.chat} user={seed.bob} />
        </div>
      </Section>

      <Section
        title="Canvas and map"
        chain={[frame, root]}
        sources={[
          { name: "canvas.tsx", code: canvasSource },
          { name: "place.tsx", code: placeSource },
          { name: "map.tsx", code: mapSource },
          { name: "places.ts", code: placesSource },
        ]}
        prose={
          <p>
            The canvas document stores a <code>componentUrl</code>, a{" "}
            <code>docUrl</code>, and a position per item, so the canvas only
            drags wrappers and spawns whatever the document names: every place
            card is its own process editing its own document, and the map is
            just another component on the canvas.
          </p>
        }
      >
        <Canvas dir={root} doc={seed.canvas} />
      </Section>

      <Section
        title="The URL is a text field"
        chain={[frame, browser]}
        sources={[
          { name: "route.ts", code: routeSource },
          { name: "urlbar.tsx", code: urlbarSource },
          { name: "markdown.tsx", code: markdownSource },
        ]}
        prose={
          <p>
            A <code>Route</code> process keeps the part after the host in the
            directory as <code>url</code> and mounts <code>selectedDoc</code> as
            a two-way lens over it, so the bar only ever writes the url, the
            editor only ever rebinds the doc, and each follows the other.
          </p>
        }
      >
        <div class="browser">
          <div class="browser-chrome">
            <span class="browser-dots">
              <i />
              <i />
              <i />
            </span>
            <UrlBar dir={browser} />
          </div>
          <div class="browser-page">
            <Markdown dir={browser} />
          </div>
        </div>
      </Section>
    </>
  );
}

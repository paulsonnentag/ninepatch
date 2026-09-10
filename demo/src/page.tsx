/** The page: three sections, each a sentence, a live example, the code
 * behind it, and the directories it runs in. Every section gets its own
 * named fork of the page's directory, and everything that runs — the
 * tools, the host's own derivations — is a process spawned there, so the
 * data panel shows exactly that section's world: windows for directories,
 * nodes beside them for what runs in them. */

import { frame, moduleUrl, seed } from "./boot";
import { Mount, Section } from "./harness";
import type { Route } from "./types";
import chatSource from "./tools/chat.tsx?raw";
import canvasSource from "./tools/canvas.tsx?raw";
import mapSource from "./tools/map.tsx?raw";
import placesSource from "./tools/places.ts?raw";
import routeSource from "./tools/route.ts?raw";
import urlbarSource from "./tools/urlbar.tsx?raw";
import markdownSource from "./tools/markdown.tsx?raw";

// --- host: one fork per section, and what runs there before rendering --------

const chat = frame.fork("chat");

const places = frame.fork("places");
places.mount("selection", null as string | null); // a plain value; never touches a document
await places.spawn("Places", moduleUrl("places.ts")).terminated; // mounts `places`, derived from the canvas

const url = frame.fork("url");
await url.spawn("Route", moduleUrl("route.ts")).terminated; // mounts `location` and `selectedDoc`
const location = await url.open<Route>("location"); // for the buttons below

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
          <Mount
            dir={chat}
            name="Alice"
            url={moduleUrl("chat.tsx")}
            mount={{ doc: seed.chat, user: seed.alice }}
          />
          <Mount
            dir={chat}
            name="Bob"
            url={moduleUrl("chat.tsx")}
            mount={{ doc: seed.chat, user: seed.bob }}
          />
        </div>
      </Section>

      <Section
        title="Canvas and map"
        chain={[frame, places]}
        sources={[
          { name: "canvas.tsx", code: canvasSource },
          { name: "map.tsx", code: mapSource },
          { name: "places.ts", code: placesSource },
        ]}
        prose={
          <p>
            The canvas edits a document of cards, a <code>Places</code> process
            derives <code>places</code> from it, and the map draws a pin per
            place and shares a <code>selection</code> entry with the canvas, so
            clicking on either side highlights the other.
          </p>
        }
      >
        <Mount
          dir={places}
          name="Canvas"
          url={moduleUrl("canvas.tsx")}
          mount={{ doc: seed.canvas }}
        />
        <Mount dir={places} name="Map" url={moduleUrl("map.tsx")} />
      </Section>

      <Section
        title="The URL is a text field"
        chain={[frame, url]}
        sources={[
          { name: "route.ts", code: routeSource },
          { name: "urlbar.tsx", code: urlbarSource },
          { name: "markdown.tsx", code: markdownSource },
        ]}
        prose={
          <p>
            A <code>Route</code> process keeps the route in the directory as{" "}
            <code>location</code>, remembered in local storage, and{" "}
            <code>selectedDoc</code> is a link derived from it that the editor
            follows wherever the buttons or the bar point it.
          </p>
        }
      >
        <div class="row">
          <button onClick={() => location.set({ docUrl: seed.notes })}>
            notes
          </button>
          <button onClick={() => location.set({ docUrl: seed.notes2 })}>
            notes2
          </button>
        </div>
        <Mount dir={url} name="UrlBar" url={moduleUrl("urlbar.tsx")} />
        <Mount dir={url} name="Markdown" url={moduleUrl("markdown.tsx")} />
      </Section>
    </>
  );
}

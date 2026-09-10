/** The page: three sections, each a sentence, a live example, the code
 * behind it, and the directories it runs in. Every section gets its own
 * named fork of the page's directory, so the data panel shows exactly
 * that section's world. The host work, fork, mount, hand the directory to
 * a tool, happens right here, and the directory is always passed by hand:
 * nothing is provided through context. */

import { derive } from "@ninepatch/core";
import { frame, seed } from "./boot";
import { setupRoute } from "./route";
import { Mount, Section } from "./harness";
import { Chat } from "./tools/chat";
import { Canvas } from "./tools/canvas";
import { MapView } from "./tools/map";
import { UrlBar } from "./tools/urlbar";
import { Markdown } from "./tools/markdown";
import type { CanvasDoc } from "./types";
import chatSource from "./tools/chat.tsx?raw";
import canvasSource from "./tools/canvas.tsx?raw";
import mapSource from "./tools/map.tsx?raw";
import routeSource from "./route.ts?raw";
import urlbarSource from "./tools/urlbar.tsx?raw";
import markdownSource from "./tools/markdown.tsx?raw";

// --- host: one fork per section, and what each mounts before rendering -------

const chat = frame.fork("chat");

const places = frame.fork("places");
places.mount("selection", null as string | null); // a plain value; never touches a document
const canvas = await places.open<CanvasDoc>("demo/canvas"); // through the folder's link
places.mount(
  "places",
  derive(canvas, (d) =>
    Object.entries(d.cards).flatMap(([id, card]) =>
      card.lat != null && card.lng != null
        ? [{ id, title: card.title, lat: card.lat, lng: card.lng }]
        : []
    )
  )
);

const url = frame.fork("url");
const location = await setupRoute(url, seed); // remembered in local storage; selectedDoc derived from it

// --- the page -----------------------------------------------------------------

export function Page() {
  return (
    <>
      <header>
        <h1>ninepatch</h1>
        <p>
          Plan 9's namespace, in the browser, over automerge: a <b>directory</b>{" "}
          is a position you navigate, mount into, and listen on, and a{" "}
          <b>handle</b> is a live grip on a value. Open this page in a second
          tab and everything syncs.
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
            tool={Chat}
            mount={{ doc: seed.chat, user: seed.alice }}
          />
          <Mount
            dir={chat}
            name="Bob"
            tool={Chat}
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
        ]}
        prose={
          <p>
            The canvas edits a document of cards, the host derives{" "}
            <code>places</code> from it, and the map draws a pin per place and
            shares a <code>selection</code> entry with the canvas, so clicking
            on either side highlights the other.
          </p>
        }
      >
        <Mount
          dir={places}
          name="Canvas"
          tool={Canvas}
          mount={{ doc: seed.canvas }}
        />
        <Mount dir={places} name="Map" tool={MapView} />
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
            The route lives in the directory as <code>location</code>,
            remembered in local storage, and <code>selectedDoc</code> is a link
            derived from it that the editor follows wherever the buttons or the
            bar point it.
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
        <Mount dir={url} name="UrlBar" tool={UrlBar} />
        <Mount dir={url} name="Markdown" tool={Markdown} />
      </Section>
    </>
  );
}

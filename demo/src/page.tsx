/** The page: four sections, each a sentence, a live example, the code
 * behind it, and the namespaces it runs in. Every section gets its own
 * named fork of the page's namespace, so the namespace panel shows exactly
 * that section's world. The host work, fork, mount, hand the namespace to
 * a tool, happens right here, and the namespace is always passed by hand:
 * nothing is provided through context. */

import { For, from } from "solid-js";
import { derive, type Handle } from "@ninepatch/core";
import { frame, ns, seed } from "./boot";
import { setupRoute, toHash } from "./route";
import { Mount, Section } from "./harness";
import { Chat } from "./tools/chat";
import { Canvas } from "./tools/canvas";
import { MapView } from "./tools/map";
import { UrlBar } from "./tools/urlbar";
import { Markdown } from "./tools/markdown";
import type { CanvasDoc, ContactDoc, Folder } from "./types";
import bootSource from "./boot.ts?raw";
import chatSource from "./tools/chat.tsx?raw";
import canvasSource from "./tools/canvas.tsx?raw";
import mapSource from "./tools/map.tsx?raw";
import routeSource from "./route.ts?raw";
import urlbarSource from "./tools/urlbar.tsx?raw";
import markdownSource from "./tools/markdown.tsx?raw";

// --- host: one fork per section, and what each mounts before rendering -------

const boot = frame.fork("boot");
const demo = await boot.open<Folder>("demo"); // link → folder doc, listed live below

const chat = frame.fork("chat");
const alice = await chat.open<ContactDoc>(seed.alice); // the contact cards edit these
const bob = await chat.open<ContactDoc>(seed.bob);

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
await setupRoute(url, seed); // location ↔ hash, selectedDoc as a derived link

// --- the page -----------------------------------------------------------------

export function Page() {
  return (
    <>
      <header>
        <h1>ninepatch</h1>
        <p>
          Plan 9's namespace, in the browser, over automerge: a <b>namespace</b>{" "}
          is a position you navigate, mount into, and listen on, and a{" "}
          <b>handle</b> is a live grip on a value. Open this page in a second
          tab and everything syncs.
        </p>
      </header>

      <Section
        title="Boot"
        chain={[ns, frame, boot]}
        sources={[{ name: "boot.ts", code: bootSource }]}
        prose={
          <p>
            One repo, one origin namespace, the repo mounted as a server that
            answers <code>automerge:</code> opens, and <code>demo</code> mounted
            as a link to the seed folder, listed here live.
          </p>
        }
      >
        <FolderView folder={demo} />
      </Section>

      <Section
        title="Two users, one chat"
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
            ns={chat}
            name="Alice"
            tool={Chat}
            mount={{ doc: seed.chat, user: seed.alice }}
          />
          <Mount
            ns={chat}
            name="Bob"
            tool={Chat}
            mount={{ doc: seed.chat, user: seed.bob }}
          />
        </div>
        <div class="row contacts">
          <ContactCard contact={alice} />
          <ContactCard contact={bob} />
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
          ns={places}
          name="Canvas"
          tool={Canvas}
          mount={{ doc: seed.canvas }}
        />
        <Mount ns={places} name="Map" tool={MapView} />
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
            The route lives in the namespace as <code>location</code>, kept in
            step with the browser's hash, and <code>selectedDoc</code> is a link
            derived from it that the editor follows wherever the buttons, the
            bar, or the address bar point it.
          </p>
        }
      >
        <div class="row">
          <button onClick={() => (window.location.hash = toHash(seed.notes))}>
            notes
          </button>
          <button onClick={() => (window.location.hash = toHash(seed.notes2))}>
            notes2
          </button>
        </div>
        <Mount ns={url} name="UrlBar" tool={UrlBar} />
        <Mount ns={url} name="Markdown" tool={Markdown} />
      </Section>
    </>
  );
}

// --- little live widgets used by the sections ---------------------------------
// Each takes a handle the host opened above; `from()` makes it a signal.

function FolderView(props: { folder: Handle<Folder> }) {
  const folder = from(props.folder, props.folder.value);
  return (
    <table class="folder">
      <tbody>
        <For each={Object.entries(folder())}>
          {([name, url]) => (
            <tr>
              <td>{name}</td>
              <td>
                <code>{url}</code>
              </td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  );
}

function ContactCard(props: { contact: Handle<ContactDoc> }) {
  const value = from(props.contact, props.contact.value);
  return (
    <label class="contact" style={{ "border-color": value().color }}>
      rename:
      <input
        value={value().name}
        onInput={(e) =>
          props.contact.change((d) => (d.name = e.currentTarget.value))
        }
      />
    </label>
  );
}

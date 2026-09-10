/** The page: five sections, each prose + a live example + the code behind
 * it + the namespaces it runs in. Every section gets its own named fork of
 * the page's namespace, so the context panel shows exactly that section's
 * world. The host work — fork, mount, hand the namespace to a tool —
 * happens right here, and the namespace is always passed by hand: nothing
 * is provided through context. */

import { For, from } from "solid-js";
import { derive, type Handle } from "@ninepatch/core";
import { frame, seed } from "./boot";
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
const demo = await boot.open<Folder>("demo"); // §0: link → folder doc, listed live below

const chat = frame.fork("chat");
const alice = await chat.open<ContactDoc>(seed.alice); // §1: the contact cards edit these
const bob = await chat.open<ContactDoc>(seed.bob);

const places = frame.fork("places");
places.mount("selection", null as string | null); // §3: a plain value; never touches a document
const canvas = await places.open<CanvasDoc>("demo/canvas"); // §2: through the folder's link
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

const selection = places.fork("selection"); // §3 sits below §2: it sees places and the shared selection
const shared = await selection.open<string | null>("selection");

const url = frame.fork("url");
await setupRoute(url, seed); // §4: location ↔ hash, selectedDoc as a derived link

// --- the page -----------------------------------------------------------------

export function Page() {
  return (
    <>
      <header>
        <h1>ninepatch</h1>
        <p>
          Plan 9's namespace, in the browser, over automerge. A <b>namespace</b>{" "}
          is a position you navigate, mount into, and listen on; a <b>handle</b>{" "}
          is a live grip on a value. Everything below runs against the same
          origin namespace — open this page in a second tab and it all syncs.
          Each section shows the example, the code behind it, and the namespaces
          it runs in: a tree of forks and opens, with what each one holds in its
          own overlay.
        </p>
      </header>

      <Section
        title="§0 Boot"
        context={boot}
        sources={[{ name: "boot.ts", code: bootSource }]}
        prose={
          <p>
            One repo (IndexedDB + BroadcastChannel), one origin namespace, and
            the repo mounted as a <i>server</i>: <code>ns.serve</code> with an{" "}
            <code>open</code> that answers <code>automerge:</code> misses by
            mounting document handles, and walks into documents by mounting
            fields. <code>demo</code> is a link to the seed folder — a document
            whose fields are URLs. The listing is <code>open("demo")</code>,
            live: it goes link → folder doc, and every entry you see is itself a
            link something below will follow. In the context panel, click into a
            value to see the document behind it — its URL, and a raw editor over
            it. A namespace that mounted nothing of its own — like the one{" "}
            <code>open("demo")</code> returned — is transparent to reads, so the
            tree leaves it out too.
          </p>
        }
      >
        <FolderView folder={demo} />
      </Section>

      <Section
        title="§1 Chat — the global, and the entry"
        context={chat}
        sources={[{ name: "chat.tsx", code: chatSource }]}
        prose={
          <>
            <p>
              How does a tool find out who's typing? The old way is a global —
              patchwork-next hangs the account off{" "}
              <code>window.patchwork.account</code> — and a global has exactly
              one answer per page. The new way is an entry in the tool's
              namespace, and the <i>host</i> decides what's there. The same chat
              is mounted twice on the <b>same document</b>: two people in one
              page, one code path, no props.
            </p>
            <p>
              Rename them below — both panes re-render, because{" "}
              <code>user</code> is a link into a contact document and reads are
              live. In the tree, Alice and Bob are the two forks; each holds its
              own <code>doc</code>, <code>user</code>, and <code>dom</code>.
              Click into <code>user</code> and edit the name right there.
            </p>
          </>
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
        title="§2 Places on a canvas, pins on a map — shared context"
        context={places}
        sources={[
          { name: "canvas.tsx", code: canvasSource },
          { name: "map.tsx", code: mapSource },
        ]}
        prose={
          <p>
            Two tools that have never heard of each other agree through the
            namespace. The canvas edits a document of cards; some cards carry a
            lat/lng. The map opens <code>places</code> and draws a pin per entry
            — it does not know what a canvas is. The host made{" "}
            <code>places</code> by deriving it from the canvas document. Give
            the third card coordinates (click it) and a pin appears.{" "}
            <code>places</code> is derived, so it's read-only — the map couldn't
            reach into the document if it tried.
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
        title="§3 Selection — both ways, ephemeral"
        context={selection}
        sources={[{ name: "map.tsx", code: mapSource }]}
        prose={
          <>
            <p>
              One line in the host: <code>places.mount("selection", null)</code>{" "}
              — a plain value, wrapped by the namespace, never touching a
              document. Click a card above, the pin lights up; click a pin, the
              card lights up. Neither tool knows the other exists; both hold the
              same handle. Current value: <SelectionValue selection={shared} />
            </p>
            <p>
              This section is a fork <i>below</i> §2, so it sees{" "}
              <code>places</code> and the shared selection. The map here got a{" "}
              <b>private</b> one — <code>mount={"{{ selection: null }}"}</code>{" "}
              shadows the shared entry, so clicking selects nothing anywhere
              else. Context vs private state is just which namespace you called{" "}
              <code>mount</code> on; the tree shows where the shadow sits.
            </p>
          </>
        }
      >
        <Mount
          ns={selection}
          name="Map (private selection)"
          tool={MapView}
          mount={{ selection: null }}
        />
      </Section>

      <Section
        title="§4 The URL is a text field"
        context={url}
        sources={[
          { name: "route.ts", code: routeSource },
          { name: "urlbar.tsx", code: urlbarSource },
          { name: "markdown.tsx", code: markdownSource },
        ]}
        prose={
          <p>
            The route lives in the namespace (<code>location</code>), synced
            both ways with the browser's hash. <code>selectedDoc</code> is a
            link <i>derived</i> from it, and the editor below opened{" "}
            <code>selectedDoc</code> once — it follows wherever the link points.
            The bar is just an input bound to <code>location</code>; it looks
            like a URL bar because it is one, ours. Switch documents with the
            buttons, the bar, or the real address bar — all three move together,
            the editor swaps documents live — and so does{" "}
            <code>selectedDoc</code> in the context panel, because it is drawn
            as what the link points at.
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

function SelectionValue(props: { selection: Handle<string | null> }) {
  const value = from(props.selection, props.selection.value);
  return <code>{JSON.stringify(value())}</code>;
}

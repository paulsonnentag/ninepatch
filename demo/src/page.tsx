/** The page: five sections, each prose + a live example + its source.
 * The host work happens right here — fork, mount, hand the namespace to a
 * tool. That's the whole demo. */

import { For } from "solid-js"
import { derive } from "@ninepatch/core"
import { createOpen, createValue, Mount, NamespaceProvider } from "@ninepatch/solid"
import { frame, seed } from "./boot"
import { setupRoute, toHash } from "./route"
import { Section } from "./harness"
import { Chat } from "./tools/chat"
import { Canvas } from "./tools/canvas"
import { MapView } from "./tools/map"
import { UrlBar } from "./tools/urlbar"
import { Markdown } from "./tools/markdown"
import type { CanvasDoc, ContactDoc, Folder } from "./types"
import bootSource from "./boot.ts?raw"
import chatSource from "./tools/chat.tsx?raw"
import canvasSource from "./tools/canvas.tsx?raw"
import mapSource from "./tools/map.tsx?raw"
import routeSource from "./route.ts?raw"
import urlbarSource from "./tools/urlbar.tsx?raw"
import markdownSource from "./tools/markdown.tsx?raw"

// --- host: what the page mounts before anything renders ----------------------

frame.mount("selection", null as string | null) // §3: a plain value; never touches a document

const canvas = await frame.open<CanvasDoc>("demo/canvas") // §2: through the folder's link
frame.mount(
  "places",
  derive(canvas, (d) =>
    Object.entries(d.cards).flatMap(([id, card]) =>
      card.lat != null && card.lng != null ? [{ id, title: card.title, lat: card.lat, lng: card.lng }] : [],
    ),
  ),
)

await setupRoute(frame, seed) // §4: location ↔ hash, selectedDoc as a derived link

// --- the page -----------------------------------------------------------------

export function Page() {
  return (
    <NamespaceProvider ns={frame}>
      <header>
        <h1>ninepatch</h1>
        <p>
          Plan 9's namespace, in the browser, over automerge. A <b>namespace</b> is a position you navigate, mount
          into, and listen on; a <b>handle</b> is a live grip on a value. Everything below runs against the same
          origin namespace — open this page in a second tab and it all syncs.
        </p>
      </header>

      <Section
        title="§0 Boot"
        source={bootSource}
        prose={
          <p>
            One repo (IndexedDB + BroadcastChannel), one origin namespace, and the repo mounted as a <i>server</i>:
            an <code>open</code> listener that answers <code>automerge:</code> misses by mounting document handles,
            and walks into documents by mounting fields. <code>demo</code> is a link to the seed folder — a document
            whose fields are URLs. The listing below is <code>open("demo")</code>, live: it goes link → folder doc,
            and every entry you see is itself a link something below will follow.
          </p>
        }
      >
        <FolderView />
      </Section>

      <Section
        title="§1 Chat — the global, and the entry"
        source={chatSource}
        prose={
          <>
            <p>
              How does a tool find out who's typing? The old way is a global — <code>window.accountDoc</code> is set
              at boot, and it works: <code>{"const contact = await repo.find(window.accountDoc.doc().contact)"}</code>.
              But a global has exactly one answer per page. The new way is an entry in the tool's namespace, and the{" "}
              <i>host</i> decides what's there. The same chat below is mounted twice on the <b>same document</b>:
            </p>
            <pre>{`<Mount tool={Chat} mount={{ doc: seed.chat, user: seed.alice }} />
<Mount tool={Chat} mount={{ doc: seed.chat, user: seed.bob }} />`}</pre>
            <p>
              Two people in one page, one code path, no props. Rename them below — both panes re-render, because{" "}
              <code>user</code> is a link into a contact document and reads are live.
            </p>
          </>
        }
      >
        <div class="row">
          <Mount tool={Chat} mount={{ doc: seed.chat, user: seed.alice }} />
          <Mount tool={Chat} mount={{ doc: seed.chat, user: seed.bob }} />
        </div>
        <div class="row contacts">
          <ContactCard url={seed.alice} />
          <ContactCard url={seed.bob} />
        </div>
      </Section>

      <Section
        title="§2 Places on a canvas, pins on a map — shared context"
        source={`${canvasSource}\n${mapSource}`}
        prose={
          <p>
            Two tools that have never heard of each other agree through the namespace. The canvas edits a document of
            cards; some cards carry a lat/lng. The map opens <code>places</code> and draws a pin per entry — it does
            not know what a canvas is. The host made <code>places</code> by deriving it from the canvas document:{" "}
            <code>{"frame.mount(\"places\", derive(canvas, (d) => …))"}</code>. Give the third card coordinates (click
            it) and a pin appears. <code>places</code> is derived, so it's read-only — the map couldn't reach into the
            document if it tried.
          </p>
        }
      >
        <Mount tool={Canvas} mount={{ doc: seed.canvas }} />
        <Mount tool={MapView} />
      </Section>

      <Section
        title="§3 Selection — both ways, ephemeral"
        prose={
          <>
            <p>
              One line in the host: <code>frame.mount("selection", null)</code> — a plain value, wrapped by the
              namespace, never touching a document. Click a card above, the pin lights up; click a pin, the card
              lights up. Neither tool knows the other exists; both hold the same handle. Current value:{" "}
              <SelectionValue />
            </p>
            <p>
              The second map below got a <b>private</b> selection — <code>{"<Mount tool={MapView} mount={{ selection: null }} />"}</code>{" "}
              shadows the shared one, so clicking here selects nothing anywhere else. Context vs private state is just
              which namespace you called <code>mount</code> on.
            </p>
          </>
        }
      >
        <Mount tool={MapView} mount={{ selection: null }} />
      </Section>

      <Section
        title="§4 The URL is a text field"
        source={`${routeSource}\n${urlbarSource}\n${markdownSource}`}
        prose={
          <p>
            The route lives in the namespace (<code>location</code>), synced both ways with the browser's hash.{" "}
            <code>selectedDoc</code> is a link <i>derived</i> from it, and the editor below opened{" "}
            <code>selectedDoc</code> once — it follows wherever the link points. The bar is just an input bound to{" "}
            <code>location</code>; it looks like a URL bar because it is one, ours. Switch documents with the buttons,
            the bar, or the real address bar — all three move together, and the editor swaps documents live.
          </p>
        }
      >
        <div class="row">
          <button onClick={() => (window.location.hash = toHash(seed.notes))}>notes</button>
          <button onClick={() => (window.location.hash = toHash(seed.notes2))}>notes2</button>
        </div>
        <Mount tool={UrlBar} />
        <Mount tool={Markdown} />
      </Section>
    </NamespaceProvider>
  )
}

// --- little live widgets used by the sections ---------------------------------

function FolderView() {
  const folder = createValue(createOpen<Folder>("demo"))
  return (
    <table class="folder">
      <tbody>
        <For each={Object.entries(folder() ?? {})}>
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
  )
}

function ContactCard(props: { url: string }) {
  const contact = createOpen<ContactDoc>(props.url)
  const value = createValue(contact)
  return (
    <label class="contact" style={{ "border-color": value()?.color }}>
      rename:
      <input
        value={value()?.name ?? ""}
        onInput={(e) => contact()!.change((d) => (d.name = e.currentTarget.value))}
      />
    </label>
  )
}

function SelectionValue() {
  const selection = createValue(createOpen<string | null>("selection"))
  return <code>{JSON.stringify(selection() ?? null)}</code>
}

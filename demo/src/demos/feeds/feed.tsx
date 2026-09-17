import {
  createEffect,
  createResource,
  createSignal,
  For,
  from,
  onCleanup,
} from "solid-js";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import type { FeedDoc } from "../../types";

// the feed; each item has a `liked` beside its fields — mounted by whoever
// placed us, never a field of the feed itself
export default async function Feed(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<FeedDoc>("document");

  const dispose = render(() => {
    const feed = from(doc, doc.value);
    const ids = () =>
      Object.keys(feed().items).sort(
        (a, b) => when(feed().items[b].pubDate) - when(feed().items[a].pubDate)
      );

    return (
      <div class="feed">
        <h3>
          <a href={feed().link} target="_blank">
            {feed().title}
          </a>
        </h3>
        <ul class="feed-items">
          <For each={ids()}>
            {(id) => {
              const item = () => feed().items[id];
              const [liked] = createResource(() =>
                dir.open<boolean>(["document", "items", id, "liked"])
              );
              onCleanup(() => liked()?.close());
              const [on, setOn] = createSignal(false);
              createEffect(() => {
                const h = liked();
                if (h) onCleanup(h.subscribe((v) => setOn(v)));
              });
              return (
                <li>
                  <span class="feed-date">{date(item().pubDate)}</span>
                  <a href={item().link} target="_blank">
                    {item().title}
                  </a>
                  <button
                    class="like"
                    classList={{ on: on() }}
                    title={on() ? "unlike" : "like"}
                    disabled={!liked()}
                    onClick={() => liked()?.set(!on())}
                  >
                    {on() ? "♥" : "♡"}
                  </button>
                </li>
              );
            }}
          </For>
        </ul>
      </div>
    );
  }, dom.value);
  dir.signal.addEventListener("abort", dispose);
}

function when(pubDate: string): number {
  const t = Date.parse(pubDate);
  return Number.isNaN(t) ? 0 : t;
}

function date(pubDate: string): string {
  const t = when(pubDate);
  return t ? new Date(t).toLocaleDateString() : "";
}

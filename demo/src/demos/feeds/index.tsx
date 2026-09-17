import type { AnyDocumentId } from "@automerge/automerge-repo";
import { derive } from "@ninepatch/core";
import { frame, moduleUrl, repo, seed } from "../../boot";
import { Section } from "../../harness";
import type { FeedDoc, LikesDoc } from "../../types";
import { fromRss, toUrl } from "./rss";

export function FeedsDemo() {
  return (
    <Section title="RSS feed" chain={[frame, root]} reset={reset}>
      {box}
    </Section>
  );
}

async function reset() {
  const likes = await repo.find<LikesDoc>(seed.likes as AnyDocumentId);
  likes.change((d) => {
    for (const key of Object.keys(d.items)) delete d.items[key];
  });
}

const root = frame.fork("root");

// The http server: a host is a node with entries, a `.xml` below it is a
// feed. A miss inside a host nobody has opened is asked as the host first
// (rule 5), so the host is answered with an empty value and the re-walk
// asks for the file.
root.serve({
  async open(target, from) {
    const [host, ...rest] = target;
    if (!/^https?:/.test(host)) return;
    if (rest.length === 0) return from.mount([host], {});
    if (!rest[rest.length - 1].endsWith(".xml")) return;
    const feed = fromRss(toUrl(target), from.signal);
    await feed.ready; // rejects if unavailable — so does the open
    from.mount(target, feed);
  },
  close(target, from) {
    if (/^https?:/.test(target[0])) from.unmount(target);
  },
});

root.mount("feed", "https://www.inkandswitch.com/index.xml"); // a link
root.mount("likes", seed.likes); // a link, to an automerge document
const feed = await root.open<FeedDoc>("feed"); // loaded, so mounts can cross the link
const likes = await root.open<LikesDoc>("likes");

// every item gets a `liked`: a boolean lens into likes, keyed by what the
// item links to, mounted next to its fields as the feed refreshes
const mounted = new Set<string>();
feed.subscribe((f) => {
  for (const [id, { title, link }] of Object.entries(f.items)) {
    if (mounted.has(id)) continue;
    mounted.add(id);
    root.mount(
      ["feed", "items", id, "liked"],
      derive(
        likes,
        (d) => link in d.items,
        (on) =>
          likes.change((d) => {
            if (on)
              d.items[link] = { title, link, feed: f.url, at: Date.now() };
            else delete d.items[link];
          })
      )
    );
  }
});

// what the feed tool gets: the feed as `document`, and no `likes` — the
// `liked` entries are on the feed, so they come along
const box = document.createElement("div");
box.className = "tool";
const feedDir = root.fork("feed");
feedDir.mount("dom", box);
feedDir.mount("document", "https://www.inkandswitch.com/index.xml");
feedDir.unmount("feed");
feedDir.unmount("likes");
feedDir.spawn("Feed", moduleUrl("feeds/feed.tsx")).terminated.catch((e) => {
  if (!feedDir.signal.aborted) box.textContent = String(e);
});

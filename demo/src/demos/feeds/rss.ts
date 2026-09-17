import { Emitter, NotFound, readonly, type Handle } from "@ninepatch/core";
import type { FeedDoc, FeedItem } from "../../types";

// a read-only handle over an RSS feed: fetched now, refetched every
// `every` ms, gone when `signal` aborts; `value` throws until `ready`
// settles, so subscribers hear nothing before there is a feed
export function fromRss(
  url: string,
  signal: AbortSignal,
  every = 10 * 60_000
): Handle<FeedDoc> & { ready: Promise<void> } {
  const changes = new Emitter();
  let current: FeedDoc | undefined;

  const refresh = async () => {
    const res = await fetch(proxied(url), { signal });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    current = parseRss(url, await res.text());
    changes.emit();
  };
  const first = refresh();
  const timer = setInterval(() => void refresh().catch(() => {}), every);
  signal.addEventListener("abort", () => clearInterval(timer));

  const handle = readonly<FeedDoc>(() => {
    if (!current) throw new NotFound([url]);
    return current;
  }, changes);
  return Object.assign(handle, { ready: first });
}

// the directory's name for a URL — one name per path segment, no `//`
export function toUrl([host, ...rest]: string[]): string {
  return host.replace(/^([a-z][a-z0-9+.-]*:)/, "$1//") + "/" + rest.join("/");
}

// feed hosts don't send CORS headers; the dev server proxies /feeds/<host>
function proxied(url: string): string {
  const { host, pathname, search } = new URL(url);
  return `/feeds/${host}${pathname}${search}`;
}

function parseRss(url: string, xml: string): FeedDoc {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const text = (el: ParentNode, selector: string) =>
    el.querySelector(selector)?.textContent?.trim() ?? "";
  const items: Record<string, FeedItem> = {};
  for (const el of doc.querySelectorAll("item")) {
    const link = text(el, "link");
    const guid = text(el, "guid") || link;
    let id = slug(link || guid);
    for (let n = 2; id in items; n++) id = `${slug(link || guid)}-${n}`;
    items[id] = {
      guid,
      link,
      title: text(el, "title"),
      pubDate: text(el, "pubDate"),
      description: text(el, "description"),
    };
  }
  return {
    url,
    title: text(doc, "channel > title"),
    link: text(doc, "channel > link"),
    items,
  };
}

// the last path segment of the link, so an item is a name you can type
function slug(url: string): string {
  const parts = url.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || url;
}

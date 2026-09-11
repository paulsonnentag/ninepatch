import type { AnyDocumentId } from "@automerge/automerge-repo";
import { frame, moduleUrl, repo, seed } from "../../boot";
import { createComponent, Section } from "../../harness";
import type { MarkdownDoc } from "../../types";
import routeSource from "./route.ts?raw";
import urlbarSource from "./urlbar.tsx?raw";
import markdownSource from "./markdown.tsx?raw";

export function BrowserDemo() {
  return (
    <Section
      title="The URL is a text field"
      chain={[frame, browser]}
      reset={reset}
      sources={[
        { name: "route.ts", code: routeSource },
        { name: "urlbar.tsx", code: urlbarSource },
        { name: "markdown.tsx", code: markdownSource },
      ]}
      prose={
        <p>
          A <code>Route</code> process keeps the part after the host in the
          directory as <code>url</code> and mounts <code>document</code> as a
          two-way lens over it, so the bar only ever writes the url, the editor
          only ever rebinds the doc, and each follows the other.
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
  );
}

async function reset() {
  const notes = await repo.find<MarkdownDoc>(seed.notes as AnyDocumentId);
  const notes2 = await repo.find<MarkdownDoc>(seed.notes2 as AnyDocumentId);
  notes.change((d) => {
    d.content = `# Notes\n\nType here. Open the page in a second tab and type there too.\n\nMore in [the second document](/${seed.notes2}).\n`;
  });
  notes2.change((d) => {
    d.content = `# The second document\n\nSwitch back and forth with the bar or the link back to [notes](/${seed.notes}).\n`;
  });
  url.set(`/${seed.notes}`);
}

const browser = frame.fork("browser");
await browser.spawn("Route", moduleUrl("browser/route.ts")).terminated; // mounts `url` and `document`
const url = await browser.open<string>("url");
const UrlBar = createComponent(moduleUrl("browser/urlbar.tsx"));
const Markdown = createComponent(moduleUrl("browser/markdown.tsx"));

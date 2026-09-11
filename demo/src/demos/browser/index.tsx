import { frame, moduleUrl } from "../../boot";
import { createComponent, Section } from "../../harness";
import routeSource from "./route.ts?raw";
import urlbarSource from "./urlbar.tsx?raw";
import markdownSource from "./markdown.tsx?raw";

export function BrowserDemo() {
  return (
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

const browser = frame.fork("browser");
await browser.spawn("Route", moduleUrl("browser/route.ts")).terminated; // mounts `url` and `document`
const UrlBar = createComponent(moduleUrl("browser/urlbar.tsx"));
const Markdown = createComponent(moduleUrl("browser/markdown.tsx"));

import { wrap } from "@ninepatch/core";
import { frame as page, moduleUrl } from "../../boot";
import { Section } from "../../harness";
import type { Workspace } from "../../types";
import { findOrCreateDocuments, resetDocuments } from "./documents";
import { NOTHING } from "./windows";
import frameSource from "./frame.tsx?raw";
import sidebarSource from "./sidebar.tsx?raw";
import tabsSource from "./tabs.tsx?raw";
import spatialSource from "./spatial.tsx?raw";
import tiledSource from "./tiled.tsx?raw";
import windowsSource from "./windows.ts?raw";
import markdownSource from "./markdown.tsx?raw";
import describeSource from "./describe.ts?raw";
import documentsSource from "./documents.ts?raw";

export function FrameDemo() {
  return (
    <Section
      title="Window management"
      chain={[page, frame]}
      reset={reset}
      sources={[
        { name: "frame.tsx", code: frameSource },
        { name: "sidebar.tsx", code: sidebarSource },
        { name: "tabs.tsx", code: tabsSource },
        { name: "spatial.tsx", code: spatialSource },
        { name: "tiled.tsx", code: tiledSource },
        { name: "windows.ts", code: windowsSource },
        { name: "markdown.tsx", code: markdownSource },
        { name: "describe.ts", code: describeSource },
        { name: "documents.ts", code: documentsSource },
      ]}
    >
      {box}
    </Section>
  );
}

async function reset() {
  await resetDocuments(documents);
  workspace.set(empty());
}

const empty = (): Workspace => ({ selected: NOTHING, open: [], surfaces: {} });

const frame = page.fork("frame");
const box = document.createElement("div");
box.className = "frame";
const documents = findOrCreateDocuments();
const workspace = wrap<Workspace>(empty());
frame.mount("dom", box);
frame.mount("document", documents); // a link: the list the sidebar shows
frame.mount("workspace", workspace); // selected, open, surfaces: shared, so a manager swap keeps it
frame.spawn("Frame", moduleUrl("frame/frame.tsx"));

import { wrap } from "@ninepatch/core";
import { frame as page, moduleUrl } from "../../boot";
import { Section } from "../../harness";
import type { Workspace } from "../../types";
import { findOrCreateDocuments, resetDocuments } from "./documents";
import { NOTHING } from "./windows";

export function FrameDemo() {
  return (
    <Section title="Window management" chain={[page, frame]} reset={reset}>
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

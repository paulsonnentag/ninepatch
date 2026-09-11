/** The page: four demos, each in its own folder under `demos/` with the
 * tools it spawns and the section that hosts them. Every demo gets its own
 * named fork of the page's directory, and everything that runs — the
 * tools, the host's own derivations — is a process spawned there, so the
 * data panel shows exactly that demo's world: windows for directories,
 * nodes beside them for what runs in them. */

import { TodosDemo } from "./demos/todos";
import { ChatDemo } from "./demos/chat";
import { CanvasDemo } from "./demos/canvas";
import { BrowserDemo } from "./demos/browser";

export function Page() {
  return (
    <>
      <header>
        <h1>ninepatch</h1>
        <p>
          Plan 9's namespace, in the browser, over automerge: a <b>directory</b>{" "}
          is a collection of named things you mount into and listen on, a{" "}
          <b>handle</b> is a live grip on a value, and a <b>process</b> is a
          module running in a directory. Open this page in a second tab and
          everything syncs.
        </p>
      </header>

      <TodosDemo />
      <ChatDemo />
      <CanvasDemo />
      <BrowserDemo />
    </>
  );
}

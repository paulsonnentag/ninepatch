import { TodosDemo } from "./demos/todos";
import { TerminalDemo } from "./demos/terminal";
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
      <TerminalDemo />
      <ChatDemo />
      <CanvasDemo />
      <BrowserDemo />
    </>
  );
}

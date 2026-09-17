import { frame, moduleUrl, seed } from "../../boot";
import { Section } from "../../harness";
import { reset } from "../todos";
import { createTerminalComponent } from "./terminal";

export function TerminalDemo() {
  return (
    <Section
      title="The same document, on a terminal"
      chain={[frame, todos]}
      reset={reset} // the same document as the section above
      prose={
        <p>
          The todo document from above, opened by a program that has no{" "}
          <code>dom</code> at all: it reads <code>keyboard</code> and writes{" "}
          <code>screen</code>, a matrix of cells you can edit in the data panel,
          and the host mounts those two where it would otherwise mount an
          element.
        </p>
      }
    >
      <TodosTui dir={todos} name="Todos tui" document={seed.todos} />
    </Section>
  );
}

const todos = frame.fork("tui");
const TodosTui = createTerminalComponent<{ document: string }>(
  moduleUrl("terminal/todos-tui.ts")
);

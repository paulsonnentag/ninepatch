import type { AnyDocumentId } from "@automerge/automerge-repo";
import { frame, moduleUrl, repo, seed, seedTodoItems } from "../../boot";
import type { TodoDoc } from "../../types";
import { createComponent, Section } from "../../harness";
import { createTerminalComponent } from "./terminal";
import todosSource from "../todos/todos.tsx?raw";
import todosTuiSource from "./todos-tui.ts?raw";
import tuiSource from "./tui.ts?raw";
import terminalSource from "./terminal.tsx?raw";

export function TerminalDemo() {
  return (
    <Section
      title="One document, two kinds of screen"
      chain={[frame, todos]}
      reset={reset}
      sources={[
        { name: "todos.tsx", code: todosSource },
        { name: "todos-tui.ts", code: todosTuiSource },
        { name: "tui.ts", code: tuiSource },
        { name: "terminal.tsx", code: terminalSource },
      ]}
      prose={
        <p>
          Two todo apps on the same document: one opens <code>dom</code> and
          renders HTML, the other opens <code>screen</code> (a writable matrix
          of cells), <code>keys</code> (the last keystroke) and{" "}
          <code>size</code>, and the host decides which of the two to mount in
          an app's directory, the way it decides what <code>document</code> is.
        </p>
      }
    >
      <div class="faces">
        <TodosDom dir={todos} name="Todos dom" document={seed.todos} />
        <TodosTui dir={todos} name="Todos tui" document={seed.todos} />
      </div>
    </Section>
  );
}

async function reset() {
  const doc = await repo.find<TodoDoc>(seed.todos as AnyDocumentId);
  doc.change((d) => {
    d.items.splice(0, d.items.length);
    d.items.push(...seedTodoItems());
  });
}

const todos = frame.fork("two-todos");
const TodosDom = createComponent<{ document: string }>(
  moduleUrl("todos/todos.tsx")
);
const TodosTui = createTerminalComponent<{ document: string }>(
  moduleUrl("terminal/todos-tui.ts")
);

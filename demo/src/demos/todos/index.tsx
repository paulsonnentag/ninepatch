import type { AnyDocumentId } from "@automerge/automerge-repo";
import { frame, moduleUrl, repo, seed, seedTodoItems } from "../../boot";
import { createComponent, Section } from "../../harness";
import type { TodoDoc } from "../../types";
import { createTerminalComponent } from "../terminal/terminal";

export function TodosDemo() {
  return (
    <Section title="Todos" chain={[frame, todos]} reset={reset}>
      <div class="stack">
        <Todos dir={todos} document={seed.todos} />
        <TodosTui dir={todos} name="tui" document={seed.todos} />
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

const todos = frame.fork("todos");
const Todos = createComponent<{ document: string }>(
  moduleUrl("todos/todos.tsx")
);
const TodosTui = createTerminalComponent<{ document: string }>(
  moduleUrl("terminal/todos-tui.ts")
);

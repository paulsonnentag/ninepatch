import type { AnyDocumentId } from "@automerge/automerge-repo";
import { frame, moduleUrl, repo, seed, seedTodoItems } from "../../boot";
import { createComponent, Section } from "../../harness";
import type { TodoDoc } from "../../types";

export function TodosDemo() {
  return (
    <Section
      title="Todos"
      chain={[frame, todos]}
      reset={reset}
      prose={
        <p>
          The smallest case: one directory holding one document, a todo tool
          spawned in it, and ticking a box in a second tab ticks it here too.
        </p>
      }
    >
      <Todos dir={todos} document={seed.todos} />
    </Section>
  );
}

export async function reset() {
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

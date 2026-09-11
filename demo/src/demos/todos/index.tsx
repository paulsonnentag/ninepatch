import { frame, moduleUrl, seed } from "../../boot";
import { createComponent, Section } from "../../harness";
import todosSource from "./todos.tsx?raw";

export function TodosDemo() {
  return (
    <Section
      title="Todos"
      chain={[frame, todos]}
      sources={[{ name: "todos.tsx", code: todosSource }]}
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

const todos = frame.fork("todos");
const Todos = createComponent<{ document: string }>(
  moduleUrl("todos/todos.tsx")
);

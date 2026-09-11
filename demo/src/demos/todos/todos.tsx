import { For, from } from "solid-js";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import type { TodoDoc } from "../../types";

export default async function Todos(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<TodoDoc>("document");

  const dispose = render(() => {
    const state = from(doc, doc.value);

    let input!: HTMLInputElement;
    return (
      <div class="todos">
        <ul class="todo-items">
          <For each={state().items}>
            {(item, i) => (
              <li classList={{ done: item.done }}>
                <label>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() =>
                      doc.change(
                        (d) => (d.items[i()].done = !d.items[i()].done)
                      )
                    }
                  />
                  <span>{item.text}</span>
                </label>
              </li>
            )}
          </For>
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const text = input.value.trim();
            if (text) doc.change((d) => d.items.push({ text, done: false }));
            input.value = "";
          }}
        >
          <input ref={input} placeholder="something to do" />
          <button>add</button>
        </form>
      </div>
    );
  }, dom.value);
  dir.signal.addEventListener("abort", dispose);
}

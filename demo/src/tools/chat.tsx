import { For, from } from "solid-js";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import type { ChatDoc, ContactDoc } from "../types";

export async function Chat(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<ChatDoc>("doc");
  const user = await dir.open<ContactDoc>("user");

  const dispose = render(() => {
    const chat = from(doc, doc.value);
    const me = from(user, user.value);
    const send = (text: string) =>
      doc.change((d) => {
        d.messages.push({
          author: me().name,
          color: me().color,
          text,
          at: Date.now(),
        });
      });

    let input!: HTMLInputElement;
    return (
      <div class="chat">
        <div class="chat-header" style={{ color: me().color }}>
          {me().name}
        </div>
        <ul class="chat-messages">
          <For each={chat().messages}>
            {(message) => (
              <li classList={{ mine: message.author === me().name }}>
                <b style={{ color: message.color }}>{message.author}</b>{" "}
                {message.text}
              </li>
            )}
          </For>
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.value.trim()) send(input.value.trim());
            input.value = "";
          }}
        >
          <input ref={input} placeholder={`say something as ${me().name}`} />
          <button>send</button>
        </form>
      </div>
    );
  }, dom.value);
  dir.signal.addEventListener("abort", dispose);
}

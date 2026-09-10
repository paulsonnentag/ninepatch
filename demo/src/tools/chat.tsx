/** §1. The document is the `doc` entry, the user is the `user` entry.
 * The tool never learns who it's running as — the host decided that by
 * what it mounted. Mount it twice on the same doc with different users
 * and you have two people in one page. */

import { For } from "solid-js";
import { createOpen, createValue, tool } from "@ninepatch/solid";
import type { ChatDoc, ContactDoc } from "../types";

export const Chat = tool(() => {
  const doc = createOpen<ChatDoc>("doc");
  const user = createOpen<ContactDoc>("user");
  const chat = createValue(doc);
  const me = createValue(user);

  const send = (text: string) =>
    doc()!.change((d) => {
      d.messages.push({
        author: me()!.name,
        color: me()!.color,
        text,
        at: Date.now(),
      });
    });

  let input!: HTMLInputElement;
  return (
    <div class="chat">
      <div class="chat-header" style={{ color: me()?.color }}>
        {me()?.name ?? "…"}
      </div>
      <ul class="chat-messages">
        <For each={chat()?.messages ?? []}>
          {(message) => (
            <li classList={{ mine: message.author === me()?.name }}>
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
        <input
          ref={input}
          placeholder={`say something as ${me()?.name ?? "…"}`}
        />
        <button>send</button>
      </form>
    </div>
  );
});

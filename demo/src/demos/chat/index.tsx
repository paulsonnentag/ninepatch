import { frame, moduleUrl, seed } from "../../boot";
import { createComponent, Section } from "../../harness";
import chatSource from "./chat.tsx?raw";

export function ChatDemo() {
  return (
    <Section
      title="Chat"
      chain={[frame, chat]}
      sources={[{ name: "chat.tsx", code: chatSource }]}
      prose={
        <p>
          The same chat tool is mounted twice on the same document with a
          different <code>user</code> entry each time, so who is typing is
          decided by the host instead of a global.
        </p>
      }
    >
      <div class="row">
        <Chat dir={chat} name="Alice" document={seed.chat} user={seed.alice} />
        <Chat dir={chat} name="Bob" document={seed.chat} user={seed.bob} />
      </div>
    </Section>
  );
}

const chat = frame.fork("chat");
const Chat = createComponent<{ document: string; user: string }>(
  moduleUrl("chat/chat.tsx")
);

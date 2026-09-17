import type { AnyDocumentId } from "@automerge/automerge-repo";
import { frame, moduleUrl, repo, seed, seedChatMessages } from "../../boot";
import { createComponent, Section } from "../../harness";
import type { ChatDoc } from "../../types";

export function ChatDemo() {
  return (
    <Section title="Chat" chain={[frame, chat]} reset={reset}>
      <div class="row">
        <Chat dir={chat} name="alice" document={seed.chat} user={seed.alice} />
        <Chat dir={chat} name="bob" document={seed.chat} user={seed.bob} />
      </div>
    </Section>
  );
}

async function reset() {
  const doc = await repo.find<ChatDoc>(seed.chat as AnyDocumentId);
  doc.change((d) => {
    d.messages.splice(0, d.messages.length);
    d.messages.push(...seedChatMessages());
  });
}

const chat = frame.fork("chat");
const Chat = createComponent<{ document: string; user: string }>(
  moduleUrl("chat/chat.tsx")
);

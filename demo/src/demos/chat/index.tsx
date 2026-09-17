import type { AnyDocumentId } from "@automerge/automerge-repo";
import { frame, moduleUrl, repo, seed, seedChatMessages } from "../../boot";
import { createComponent, Section } from "../../harness";
import type { ChatDoc } from "../../types";

export function ChatDemo() {
  return (
    <Section title="Chat" chain={[frame, chat]} reset={reset} about={about}>
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

const about = (
  <>
    <p>
      A tool runs in a directory forked from its parent, and that directory is
      all it can see. Two chats side by side are two forks of <code>chat</code>:
      the same document mounted in both, a different user in each.
    </p>
    <pre>{`frame/
└── chat/
    ├── alice/                Chat runs here
    │   ├── dom               the element it renders into
    │   ├── document  →       the chat document (a link)
    │   └── user      →       alice's contact document
    └── bob/
        ├── dom
        ├── document  →       the same chat document
        └── user      →       bob's

const chat = frame.fork("chat");
const alice = chat.fork("alice");
alice.mount("document", seed.chat);
alice.mount("user", seed.alice);
alice.spawn("Chat", moduleUrl("chat/chat.tsx"));

// chat.tsx opens what it was given, and nothing else
export default async function Chat(dir: Directory) {
  const doc = await dir.open<ChatDoc>("document");
  const user = await dir.open<ContactDoc>("user");`}</pre>
  </>
);

const chat = frame.fork("chat");
const Chat = createComponent<{ document: string; user: string }>(
  moduleUrl("chat/chat.tsx")
);

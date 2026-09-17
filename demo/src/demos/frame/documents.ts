import type { AnyDocumentId } from "@automerge/automerge-repo";
import { repo } from "../../boot";
import type { DocumentsDoc, MarkdownDoc } from "../../types";

const KEY = "ninepatch:demo:frame:documents";

/** The documents list's URL: the one from last time, or a fresh set. */
export function findOrCreateDocuments(): string {
  const found = localStorage.getItem(KEY);
  if (found) return found;
  const list = repo.create<DocumentsDoc>({
    type: "documents",
    documents: seedNotes(),
  });
  localStorage.setItem(KEY, list.url);
  return list.url;
}

/** Fresh notes into the same list, so what points at it keeps working. */
export async function resetDocuments(url: string): Promise<void> {
  const list = await repo.find<DocumentsDoc>(url as AnyDocumentId);
  const notes = seedNotes();
  list.change((d) => {
    d.documents = notes;
  });
}

/** A new empty note; the sidebar's plus button makes one. */
export function createNote(): string {
  return repo.create<MarkdownDoc>({
    type: "markdown",
    content: "# Untitled\n\n",
  }).url;
}

// three notes that link to each other; every note carries its type
function seedNotes(): string[] {
  const welcome = repo.create<MarkdownDoc>({ type: "markdown", content: "" });
  const ideas = repo.create<MarkdownDoc>({ type: "markdown", content: "" });
  const log = repo.create<MarkdownDoc>({ type: "markdown", content: "" });
  welcome.change((d) => {
    d.content = `# Welcome\n\nEach entry in the sidebar is a document. Click one to open it; click again to focus it. Right-click one to pick where it opens.\n\nLinks in a note work the same way: [ideas](/${ideas.url}), or the [log](/${log.url}).\n\nSwitch the window manager above the sidebar — what is open stays open.\n`;
  });
  ideas.change((d) => {
    d.content = `# Ideas\n\n- windows that remember where they were\n- a manager that saves its layout\n\nBack to [welcome](/${welcome.url}).\n`;
  });
  log.change((d) => {
    d.content = `# Log\n\nNothing yet. See [ideas](/${ideas.url}).\n`;
  });
  return [welcome.url, ideas.url, log.url];
}

/** CodeMirror 6 ↔ Handle. Document → editor as a minimal prefix/suffix
 * replace (the cursor survives); editor → document through automerge's
 * `updateText`, which splices, so concurrent edits merge instead of
 * clobbering. */

import { Annotation, StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { updateText } from "@automerge/automerge";
import type { Handle } from "@ninepatch/core";

export function bindText(
  view: EditorView,
  source: Handle<unknown>,
  path: string[]
): () => void {
  let stopped = false;

  // Nothing there right now (rule 9) means no call at all: the editor
  // keeps the last text until something is.
  const pull = (value: unknown) => {
    if (stopped) return;
    const at = read(value, path);
    const text = typeof at === "string" ? at : "";
    const current = view.state.doc.toString();
    if (text === current) return;
    const [from, to, insert] = splice(current, text);
    view.dispatch({
      changes: { from, to, insert },
      annotations: remote.of(true),
    });
  };

  const push = EditorView.updateListener.of((update) => {
    if (stopped || !update.docChanged) return;
    if (update.transactions.some((t) => t.annotation(remote))) return;
    const text = update.state.doc.toString();
    source.change((draft) => {
      if (typeof read(draft, path) === "string") {
        updateText(draft as Parameters<typeof updateText>[0], path, text);
      } else {
        write(draft, path, text);
      }
    });
  });

  view.dispatch({ effects: StateEffect.appendConfig.of(push) });
  const unsubscribe = source.subscribe(pull); // pulls once now, then on every change

  return () => {
    stopped = true;
    unsubscribe();
  };
}

const remote = Annotation.define<boolean>();

function read(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>(
    (at, key) => (at as Record<string, unknown> | undefined)?.[key],
    value
  );
}

function write(draft: unknown, path: string[], value: string): void {
  let at = draft as Record<string, unknown>;
  for (const key of path.slice(0, -1)) at = at[key] as Record<string, unknown>;
  at[path[path.length - 1]] = value;
}

function splice(current: string, next: string): [number, number, string] {
  let start = 0;
  while (
    start < current.length &&
    start < next.length &&
    current[start] === next[start]
  )
    start++;
  let endCurrent = current.length;
  let endNext = next.length;
  while (
    endCurrent > start &&
    endNext > start &&
    current[endCurrent - 1] === next[endNext - 1]
  ) {
    endCurrent--;
    endNext--;
  }
  return [start, endCurrent, next.slice(start, endNext)];
}

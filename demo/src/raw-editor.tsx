/** A raw view and editor for any value behind a handle — an automerge
 * document or a plain mounted object. Ported from patchwork-base-3's
 * `raw` tool, minus virtualization, undo, and downloads: a tree of rows,
 * expand and collapse, edit a primitive in place, add a field, delete,
 * rename a key. Writes go through `handle.change`; strings inside an
 * automerge document go through `updateText` so concurrent edits merge. */

import { createSignal, For, from, Show } from "solid-js";
import { isAutomerge, updateText } from "@automerge/automerge";
import { hasScheme, type Handle } from "@ninepatch/core";

type Prop = string | number;
type Kind = "string" | "number" | "boolean" | "null" | "object" | "array";

export function RawEditor(props: { handle: Handle<unknown> }) {
  const value = from(props.handle, props.handle.value);
  const [error, setError] = createSignal<string | undefined>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** Every write: through `change`, or `set` for a primitive root. A
   * read-only handle throws — shown briefly, then forgotten. */
  const write = (fn: (draft: unknown) => void, root?: unknown) => {
    try {
      if (root !== undefined) props.handle.set(root);
      else props.handle.change(fn);
    } catch (e) {
      setError((e as Error).message);
      clearTimeout(timer);
      timer = setTimeout(() => setError(undefined), 1500);
    }
  };

  return (
    <div class="raw">
      <Show when={error()}>
        <div class="raw-error">{error()}</div>
      </Show>
      <Show
        when={isCollection(value())}
        fallback={
          <PrimitiveRoot value={value()} set={(v) => write(() => {}, v)} />
        }
      >
        <Node
          path={[]}
          value={value()}
          depth={0}
          write={write}
          root
          parentIsArray={false}
        />
      </Show>
    </div>
  );
}

// --- rows -----------------------------------------------------------------------

function Node(props: {
  path: Prop[];
  value: unknown;
  depth: number;
  root?: boolean;
  parentIsArray: boolean;
  write: (fn: (draft: unknown) => void) => void;
}) {
  const [expanded, setExpanded] = createSignal(props.depth < 2);
  const [editing, setEditing] = createSignal<"value" | "key" | undefined>();
  const [adding, setAdding] = createSignal(false);
  const coll = () => isCollection(props.value);
  const isArr = () => Array.isArray(props.value);
  const key = () => props.path[props.path.length - 1];
  const entries = () =>
    Array.isArray(props.value)
      ? props.value.map((v, i) => [i, v] as [Prop, unknown])
      : Object.entries(props.value as object);

  const confirmValue = (next: unknown) => {
    props.write((d) => setAt(d, props.path, next));
    setEditing(undefined);
  };
  const confirmKey = (newKey: string) => {
    props.write((d) => renameKey(d, props.path, newKey));
    setEditing(undefined);
  };
  const confirmAdd = (k: string | undefined, next: unknown) => {
    props.write((d) => {
      const parent = at(d, props.path) as Record<string, unknown> | unknown[];
      if (Array.isArray(parent)) parent.push(next);
      else if (k) parent[k] = next;
    });
    setAdding(false);
  };
  const remove = () => props.write((d) => deleteAt(d, props.path));

  return (
    <>
      <div class="raw-row" style={{ "padding-left": `${props.depth * 14}px` }}>
        <Show
          when={coll()}
          fallback={<span class="raw-toggle raw-toggle-spacer" />}
        >
          <span class="raw-toggle" onClick={() => setExpanded((v) => !v)}>
            {expanded() ? "▾" : "▸"}
          </span>
        </Show>
        <Show when={!props.root}>
          <Show
            when={editing() === "key"}
            fallback={
              <span
                class="raw-key"
                classList={{ index: props.parentIsArray }}
                onDblClick={() => {
                  if (!props.parentIsArray) setEditing("key");
                }}
              >
                {props.parentIsArray ? key() : JSON.stringify(String(key()))}
              </span>
            }
          >
            <KeyEditor
              initial={String(key())}
              confirm={confirmKey}
              cancel={() => setEditing(undefined)}
            />
          </Show>
          <span class="raw-colon">: </span>
        </Show>
        <Show
          when={editing() === "value"}
          fallback={
            <ValueText
              value={props.value}
              expanded={expanded()}
              onEdit={() => setEditing("value")}
            />
          }
        >
          <InlineEditor
            value={props.value}
            confirm={confirmValue}
            cancel={() => setEditing(undefined)}
          />
        </Show>
        <span class="raw-actions">
          <Show when={!coll() && !(props.value instanceof Uint8Array)}>
            <button title="Edit" onClick={() => setEditing("value")}>
              ✎
            </button>
          </Show>
          <Show when={coll()}>
            <button
              title="Add"
              onClick={() => {
                setExpanded(true);
                setAdding(true);
              }}
            >
              +
            </button>
          </Show>
          <button title="Copy value" onClick={() => copy(props.value)}>
            ⧉
          </button>
          <Show when={!props.root}>
            <button title="Delete" onClick={remove}>
              ×
            </button>
          </Show>
        </span>
      </div>
      <Show when={coll() && expanded()}>
        <For each={entries()}>
          {([k, v]) => (
            <Node
              path={[...props.path, k]}
              value={v}
              depth={props.depth + 1}
              parentIsArray={isArr()}
              write={props.write}
            />
          )}
        </For>
        <Show when={adding()}>
          <div
            class="raw-row"
            style={{ "padding-left": `${(props.depth + 1) * 14}px` }}
          >
            <AddField
              isArray={isArr()}
              confirm={confirmAdd}
              cancel={() => setAdding(false)}
            />
          </div>
        </Show>
        <div
          class="raw-row"
          style={{ "padding-left": `${props.depth * 14}px` }}
        >
          <span class="raw-toggle raw-toggle-spacer" />
          <span class="raw-bracket">{isArr() ? "]" : "}"}</span>
        </div>
      </Show>
    </>
  );
}

function ValueText(props: {
  value: unknown;
  expanded: boolean;
  onEdit: () => void;
}) {
  const v = () => props.value;
  return (
    <Show
      when={isCollection(v())}
      fallback={
        <Show
          when={v() instanceof Uint8Array}
          fallback={
            <Show
              when={typeof v() === "string" && hasScheme(v() as string)}
              fallback={
                <span
                  class={`raw-value ${typeOf(v())}`}
                  onDblClick={props.onEdit}
                >
                  {v() === null ? "null" : JSON.stringify(v())}
                </span>
              }
            >
              <span
                class="raw-value url"
                title="click to copy"
                onClick={() => copy(v())}
              >
                {v() as string}
              </span>
            </Show>
          }
        >
          <span class="raw-badge">
            Uint8Array · {(v() as Uint8Array).byteLength} bytes
          </span>
        </Show>
      }
    >
      <span class="raw-bracket">{Array.isArray(v()) ? "[" : "{"}</span>
      <Show when={!props.expanded}>
        <span class="raw-count">
          {count(v())} {count(v()) === 1 ? "item" : "items"}
        </span>
        <span class="raw-bracket">{Array.isArray(v()) ? "]" : "}"}</span>
      </Show>
    </Show>
  );
}

function PrimitiveRoot(props: { value: unknown; set: (v: unknown) => void }) {
  const [editing, setEditing] = createSignal(false);
  return (
    <div class="raw-row">
      <span class="raw-toggle raw-toggle-spacer" />
      <Show
        when={editing()}
        fallback={
          <>
            <ValueText
              value={props.value}
              expanded={false}
              onEdit={() => setEditing(true)}
            />
            <span class="raw-actions">
              <button title="Edit" onClick={() => setEditing(true)}>
                ✎
              </button>
            </span>
          </>
        }
      >
        <InlineEditor
          value={props.value}
          confirm={(v) => {
            props.set(v);
            setEditing(false);
          }}
          cancel={() => setEditing(false)}
        />
      </Show>
    </div>
  );
}

// --- editors --------------------------------------------------------------------

function InlineEditor(props: {
  value: unknown;
  confirm: (next: unknown) => void;
  cancel: () => void;
}) {
  const [kind, setKind] = createSignal<Kind>(typeOf(props.value));
  const [text, setText] = createSignal(
    props.value === null || typeof props.value === "object"
      ? ""
      : String(props.value)
  );
  const confirm = () => props.confirm(parse(text(), kind()));
  return (
    <span class="raw-inline">
      <TextOrBool
        kind={kind()}
        text={text()}
        setText={setText}
        confirm={confirm}
        cancel={props.cancel}
        focus
      />
      <KindSelect kind={kind()} setKind={setKind} setText={setText} />
      <OkCancel confirm={confirm} cancel={props.cancel} />
    </span>
  );
}

function AddField(props: {
  isArray: boolean;
  confirm: (key: string | undefined, next: unknown) => void;
  cancel: () => void;
}) {
  const [key, setKey] = createSignal("");
  const [kind, setKind] = createSignal<Kind>("string");
  const [text, setText] = createSignal("");
  const confirm = () => {
    if (!props.isArray && key() === "") return;
    props.confirm(props.isArray ? undefined : key(), parse(text(), kind()));
  };
  return (
    <span class="raw-inline">
      <Show when={!props.isArray}>
        <input
          class="raw-input"
          placeholder="key"
          value={key()}
          onInput={(e) => setKey(e.currentTarget.value)}
          onKeyDown={(e) => keys(e, confirm, props.cancel)}
          ref={(el) => requestAnimationFrame(() => el.focus())}
        />
      </Show>
      <TextOrBool
        kind={kind()}
        text={text()}
        setText={setText}
        confirm={confirm}
        cancel={props.cancel}
        focus={props.isArray}
      />
      <KindSelect kind={kind()} setKind={setKind} setText={setText} />
      <OkCancel confirm={confirm} cancel={props.cancel} />
    </span>
  );
}

function KeyEditor(props: {
  initial: string;
  confirm: (next: string) => void;
  cancel: () => void;
}) {
  const [text, setText] = createSignal(props.initial);
  const confirm = () => {
    const next = text().trim();
    if (next && next !== props.initial) props.confirm(next);
    else props.cancel();
  };
  return (
    <span class="raw-inline">
      <input
        class="raw-input"
        value={text()}
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => keys(e, confirm, props.cancel)}
        ref={(el) =>
          requestAnimationFrame(() => {
            el.focus();
            el.select();
          })
        }
      />
      <OkCancel confirm={confirm} cancel={props.cancel} />
    </span>
  );
}

function TextOrBool(props: {
  kind: Kind;
  text: string;
  setText: (t: string) => void;
  confirm: () => void;
  cancel: () => void;
  focus?: boolean;
}) {
  return (
    <>
      <Show when={props.kind === "string" || props.kind === "number"}>
        <input
          class="raw-input"
          placeholder="value"
          value={props.text}
          onInput={(e) => props.setText(e.currentTarget.value)}
          onKeyDown={(e) => keys(e, props.confirm, props.cancel)}
          ref={(el) => {
            if (props.focus) requestAnimationFrame(() => el.focus());
          }}
        />
      </Show>
      <Show when={props.kind === "boolean"}>
        <select
          class="raw-input"
          value={props.text}
          onChange={(e) => props.setText(e.currentTarget.value)}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </Show>
    </>
  );
}

function KindSelect(props: {
  kind: Kind;
  setKind: (k: Kind) => void;
  setText: (t: string) => void;
}) {
  return (
    <select
      class="raw-input raw-kind"
      value={props.kind}
      onChange={(e) => {
        const k = e.currentTarget.value as Kind;
        props.setKind(k);
        if (k === "boolean") props.setText("true");
        else if (k !== "string" && k !== "number") props.setText("");
      }}
    >
      <option value="string">string</option>
      <option value="number">number</option>
      <option value="boolean">boolean</option>
      <option value="null">null</option>
      <option value="object">object {"{}"}</option>
      <option value="array">array []</option>
    </select>
  );
}

function OkCancel(props: { confirm: () => void; cancel: () => void }) {
  return (
    <>
      <button class="raw-ok" title="Confirm" onClick={props.confirm}>
        ✓
      </button>
      <button class="raw-cancel" title="Cancel" onClick={props.cancel}>
        ×
      </button>
    </>
  );
}

function keys(e: KeyboardEvent, confirm: () => void, cancel: () => void) {
  if (e.key === "Enter") confirm();
  if (e.key === "Escape") cancel();
}

// --- values ---------------------------------------------------------------------

function isCollection(v: unknown): v is object {
  return v !== null && typeof v === "object" && !(v instanceof Uint8Array);
}

function count(v: unknown): number {
  return Array.isArray(v) ? v.length : Object.keys(v as object).length;
}

function typeOf(v: unknown): Kind {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  const t = typeof v;
  return t === "string" || t === "number" || t === "boolean" ? t : "object";
}

function parse(text: string, kind: Kind): unknown {
  switch (kind) {
    case "null":
      return null;
    case "boolean":
      return text === "true";
    case "number": {
      const n = Number(text);
      return Number.isNaN(n) ? text : n;
    }
    case "object":
      return {};
    case "array":
      return [];
    default:
      return text;
  }
}

function at(root: unknown, path: Prop[]): unknown {
  return path.reduce<unknown>(
    (node, key) => (node as Record<Prop, unknown> | undefined)?.[key],
    root
  );
}

/** Replace the value at `path`. A string over a string inside an automerge
 * document becomes an `updateText` so concurrent edits merge instead of
 * clobbering. */
function setAt(root: unknown, path: Prop[], next: unknown): void {
  const parent = at(root, path.slice(0, -1)) as Record<Prop, unknown>;
  const key = path[path.length - 1];
  const current = parent[key];
  if (
    typeof next === "string" &&
    typeof current === "string" &&
    isAutomerge(root as object)
  ) {
    updateText(root as object, path, next);
  } else {
    parent[key] = next;
  }
}

function deleteAt(root: unknown, path: Prop[]): void {
  const parent = at(root, path.slice(0, -1)) as
    Record<Prop, unknown> | unknown[];
  const key = path[path.length - 1];
  if (Array.isArray(parent) && typeof key === "number") parent.splice(key, 1);
  else delete (parent as Record<Prop, unknown>)[key];
}

function renameKey(root: unknown, path: Prop[], newKey: string): void {
  const parent = at(root, path.slice(0, -1)) as Record<Prop, unknown>;
  const oldKey = path[path.length - 1];
  parent[newKey] = parent[oldKey];
  delete parent[oldKey];
}

function copy(value: unknown): void {
  const text =
    typeof value === "string"
      ? value
      : value instanceof Uint8Array
        ? btoa(String.fromCharCode(...value))
        : JSON.stringify(value, null, 2);
  void navigator.clipboard?.writeText(text);
}

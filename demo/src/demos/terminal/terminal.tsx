import {
  createSignal,
  from,
  Index,
  onCleanup,
  onMount,
  splitProps,
} from "solid-js";
import { wrap, type Directory, type Handle } from "@ninepatch/core";
import type { Cell, Key, Screen, Size } from "../../types";
import { blank, text } from "./tui";

const INITIAL: Size = { cols: 48, rows: 14 };

// The terminal side of a tool: where `createComponent` mounts a <div> as
// `dom`, this mounts `size`, `screen` and `keys`, draws the matrix, and
// spawns the program in the fork. The terminal is the host's, not a
// process: the app's directory holds only what the app opens.
export function createTerminalComponent<
  Props extends Record<string, unknown> = Record<never, never>,
>(url: string) {
  const fallback = programName(url);
  return function Component(props: Props & { dir: Directory; name?: string }) {
    const [own, mounts] = splitProps(props, ["dir", "name"]);
    const dir = own.dir.fork(own.name ?? fallback);
    for (const [entry, value] of Object.entries(mounts))
      dir.mount(entry, value);

    const size = wrap<Size>(INITIAL);
    const screen = wrap<Screen>(blank(INITIAL));
    const keys = wrap<Key | null>(null);
    dir.mount("size", size);
    dir.mount("screen", screen);
    dir.mount("keys", keys);

    dir.spawn(fallback, url).terminated.catch((e: unknown) => {
      if (dir.signal.aborted) return;
      const s = blank(size.value);
      text(s, 0, 0, `${fallback}: ${String(e)}`, { fg: "#f87171" });
      screen.set(s);
    });
    onCleanup(() => dir.close());
    return <Grid size={size} screen={screen} keys={keys} />;
  };
}

function programName(url: string): string {
  const base = url
    .split("/")
    .pop()!
    .replace(/\.tsx?$/, "");
  return base[0].toUpperCase() + base.slice(1);
}

function Grid(props: {
  size: Handle<Size>;
  screen: Handle<Screen>;
  keys: Handle<Key | null>;
}) {
  const screen = from(props.screen, props.screen.value);
  const [focused, setFocused] = createSignal(false);
  let pre!: HTMLPreElement;
  let probe!: HTMLSpanElement;
  let seq = 0;

  const lines = () => {
    const s = screen();
    const out: Cell[][] = [];
    for (let row = 0; row < s.rows; row++)
      out.push(s.cells.slice(row * s.cols, (row + 1) * s.cols));
    return out;
  };
  const isCursor = (row: number, col: number) => {
    const c = screen().cursor;
    return c !== null && c.row === row && c.col === col;
  };

  onMount(() => {
    const measure = () => {
      const cell = probe.getBoundingClientRect();
      const style = getComputedStyle(pre);
      const width =
        pre.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      const height =
        pre.clientHeight -
        parseFloat(style.paddingTop) -
        parseFloat(style.paddingBottom);
      if (cell.width === 0 || cell.height === 0) return;
      props.size.set({
        cols: Math.max(8, Math.floor(width / cell.width)),
        rows: Math.max(3, Math.floor(height / cell.height)),
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(pre);
    onCleanup(() => observer.disconnect());
    measure();
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (["Shift", "Control", "Alt", "Meta", "Tab"].includes(e.key)) return;
    if (e.metaKey) return; // the browser's own shortcuts stay the browser's
    e.preventDefault();
    props.keys.set({
      seq: ++seq,
      key: e.key,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey,
    });
  };

  return (
    <pre
      class="terminal"
      classList={{ focused: focused() }}
      tabindex={0}
      ref={pre}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <span class="term-probe" ref={probe}>
        M
      </span>
      <Index each={lines()}>
        {(line, row) => (
          <div class="term-row">
            <Index each={line()}>
              {(cell, col) => (
                <span
                  classList={{
                    inverse: cell().inverse,
                    bold: cell().bold,
                    cursor: isCursor(row, col),
                  }}
                  style={{ color: cell().fg, background: cell().bg }}
                >
                  {cell().ch}
                </span>
              )}
            </Index>
          </div>
        )}
      </Index>
    </pre>
  );
}

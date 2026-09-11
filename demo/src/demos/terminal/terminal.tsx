import {
  createSignal,
  from,
  Index,
  onCleanup,
  onMount,
  splitProps,
} from "solid-js";
import { wrap, type Directory, type Handle } from "@ninepatch/core";
import type { Keyboard, Screen, Size } from "../../types";
import { blank, text } from "./tui";

const INITIAL: Size = { cols: 48, rows: 14 };
const IDLE: Keyboard = {
  pressedKey: null,
  isPressed: false,
  seq: 0,
  ctrl: false,
  alt: false,
  shift: false,
  meta: false,
};

// The terminal side of a tool: where `createComponent` mounts a <div> as
// `dom`, this mounts `screen` and `keyboard`, draws the matrix, and spawns
// the program in the fork. The terminal is the host's, not a process: the
// app's directory holds only what the app opens.
export function createTerminalComponent<
  Props extends Record<string, unknown> = Record<never, never>,
>(url: string) {
  const fallback = programName(url);
  return function Component(props: Props & { dir: Directory; name?: string }) {
    const [own, mounts] = splitProps(props, ["dir", "name"]);
    const dir = own.dir.fork(own.name ?? fallback);
    for (const [entry, value] of Object.entries(mounts))
      dir.mount(entry, value);

    const screen = wrap<Screen>(blank(INITIAL));
    const keyboard = wrap<Keyboard>(IDLE);
    dir.mount("screen", screen);
    dir.mount("keyboard", keyboard);

    dir.spawn(fallback, url).terminated.catch((e: unknown) => {
      if (dir.signal.aborted) return;
      const s = blank(screen.value);
      text(s, 0, 0, `${fallback}: ${String(e)}`, { fg: "#f87171" });
      screen.set(s);
    });
    onCleanup(() => dir.close());
    return <Grid screen={screen} keyboard={keyboard} />;
  };
}

function programName(url: string): string {
  const base = url
    .split("/")
    .pop()!
    .replace(/\.tsx?$/, "");
  return base[0].toUpperCase() + base.slice(1);
}

function Grid(props: { screen: Handle<Screen>; keyboard: Handle<Keyboard> }) {
  const screen = from(props.screen, props.screen.value);
  const [focused, setFocused] = createSignal(false);
  let pre!: HTMLPreElement;
  let probe!: HTMLSpanElement;

  // fresh row arrays every time: a cell edited in place still redraws
  const lines = () => {
    const s = screen();
    return Array.from({ length: s.rows }, (_, row) =>
      s.cells.slice(row * s.cols, (row + 1) * s.cols)
    );
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
      const size = {
        cols: Math.max(8, Math.floor(width / cell.width)),
        rows: Math.max(3, Math.floor(height / cell.height)),
      };
      const s = props.screen.value;
      if (size.cols !== s.cols || size.rows !== s.rows)
        props.screen.set(blank(size)); // cleared, like a real terminal on resize
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
    props.keyboard.set({
      pressedKey: e.key,
      isPressed: true,
      seq: props.keyboard.value.seq + 1,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey,
    });
  };
  const release = (key?: string) => {
    const k = props.keyboard.value;
    if (k.isPressed && (key === undefined || key === k.pressedKey))
      props.keyboard.set({ ...k, isPressed: false });
  };

  return (
    <pre
      class="terminal"
      classList={{ focused: focused() }}
      tabindex={0}
      ref={pre}
      onKeyDown={onKeyDown}
      onKeyUp={(e) => release(e.key)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        release();
      }}
    >
      <span class="term-probe" ref={probe}>
        M
      </span>
      <Index each={lines()}>
        {(line, row) => (
          <div class="term-row">
            <Index each={line()}>
              {(_, col) => {
                const cell = () => line()[col];
                return (
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
                );
              }}
            </Index>
          </div>
        )}
      </Index>
    </pre>
  );
}

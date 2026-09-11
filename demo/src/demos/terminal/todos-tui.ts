import type { Directory, Handle } from "@ninepatch/core";
import type { Key, Screen, Size, TodoDoc } from "../../types";
import { blank, box, clip, restyle, text } from "./tui";

type Ui = { at: number; mode: "list" | "prompt"; input: string };

const FAINT = "#7c8494";
const HINT = "↑↓ move · space toggle · a add · d delete";

export default async function Todos(dir: Directory) {
  const doc = await dir.open<TodoDoc>("document");
  const size = await dir.open<Size>("size");
  const screen = await dir.open<Screen>("screen");
  const keys = await dir.open<Key | null>("keys");

  const ui: Ui = { at: 0, mode: "list", input: "" };
  const paint = () => {
    ui.at = Math.max(0, Math.min(ui.at, doc.value.items.length - 1));
    screen.set(draw(doc.value, size.value, ui));
  };

  let seen = 0;
  const unsubscribe = [
    doc.subscribe(paint),
    size.subscribe(paint),
    keys.subscribe((key) => {
      if (!key || key.seq === seen) return; // subscribe replays the last press
      seen = key.seq;
      handle(key, ui, doc);
      paint();
    }),
  ];
  dir.signal.addEventListener("abort", () => unsubscribe.forEach((u) => u()));
}

function handle(key: Key, ui: Ui, doc: Handle<TodoDoc>): void {
  if (ui.mode === "prompt") {
    if (key.key === "Escape") {
      ui.mode = "list";
      ui.input = "";
    } else if (key.key === "Enter") {
      const text = ui.input.trim();
      if (text) doc.change((d) => d.items.push({ text, done: false }));
      ui.input = "";
      ui.mode = "list";
      ui.at = doc.value.items.length - 1;
    } else if (key.key === "Backspace") {
      ui.input = ui.input.slice(0, -1);
    } else if (key.key.length === 1 && !key.ctrl && !key.alt) {
      ui.input += key.key;
    }
    return;
  }
  switch (key.key) {
    case "ArrowUp":
    case "k":
      ui.at--;
      break;
    case "ArrowDown":
    case "j":
      ui.at++;
      break;
    case " ":
    case "Enter":
    case "x":
      doc.change((d) => {
        const item = d.items[ui.at];
        if (item) item.done = !item.done;
      });
      break;
    case "d":
    case "Delete":
      doc.change((d) => {
        if (d.items[ui.at]) d.items.splice(ui.at, 1);
      });
      break;
    case "a":
    case "n":
      ui.mode = "prompt";
      break;
  }
}

function draw(doc: TodoDoc, size: Size, ui: Ui): Screen {
  const s = blank(size);
  box(s, "todos", { fg: FAINT });
  const width = s.cols - 4;
  const promptRow = s.rows - 2;
  const visible = Math.max(0, promptRow - 1);

  const first = Math.max(
    0,
    Math.min(ui.at - visible + 1, doc.items.length - visible)
  );
  doc.items.slice(first, first + visible).forEach((item, i) => {
    const row = 1 + i;
    const selected = ui.mode === "list" && first + i === ui.at;
    const style = item.done ? { fg: FAINT } : {};
    text(
      s,
      row,
      2,
      clip(`[${item.done ? "x" : " "}] ${item.text}`, width),
      style
    );
    if (selected) restyle(s, row, 1, s.cols - 1, { inverse: true });
  });
  if (doc.items.length === 0)
    text(s, 1, 2, clip("nothing to do, press a", width), { fg: FAINT });

  if (ui.mode === "prompt") {
    text(s, promptRow, 2, "> ", { bold: true });
    text(s, promptRow, 4, clip(ui.input, width - 3));
    s.cursor = {
      row: promptRow,
      col: Math.min(4 + [...ui.input].length, s.cols - 2),
    };
  } else {
    text(s, promptRow, 2, clip(HINT, width), { fg: FAINT });
  }
  return s;
}

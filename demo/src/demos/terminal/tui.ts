import type { Cell, Screen, Size } from "../../types";

export type Style = Omit<Cell, "ch">;

export function blank(size: Size): Screen {
  const { cols, rows } = size;
  return {
    cols,
    rows,
    cells: Array.from({ length: cols * rows }, () => ({ ch: " " })),
    cursor: null,
  };
}

export function text(
  screen: Screen,
  row: number,
  col: number,
  str: string,
  style: Style = {}
): void {
  if (row < 0 || row >= screen.rows) return;
  let at = col;
  for (const ch of str) {
    if (at >= 0 && at < screen.cols)
      screen.cells[row * screen.cols + at] = { ch, ...style };
    at++;
  }
}

export function restyle(
  screen: Screen,
  row: number,
  from: number,
  to: number,
  style: Style
): void {
  if (row < 0 || row >= screen.rows) return;
  for (let col = Math.max(0, from); col < Math.min(to, screen.cols); col++) {
    const i = row * screen.cols + col;
    screen.cells[i] = { ...screen.cells[i], ...style };
  }
}

export function box(screen: Screen, title = "", style: Style = {}): void {
  const { cols, rows } = screen;
  if (cols < 2 || rows < 2) return;
  text(screen, 0, 0, `┌${"─".repeat(cols - 2)}┐`, style);
  for (let row = 1; row < rows - 1; row++) {
    text(screen, row, 0, "│", style);
    text(screen, row, cols - 1, "│", style);
  }
  text(screen, rows - 1, 0, `└${"─".repeat(cols - 2)}┘`, style);
  if (title) text(screen, 0, 2, clip(` ${title} `, cols - 4), style);
}

export function clip(str: string, width: number): string {
  const chars = [...str];
  if (width <= 0) return "";
  if (chars.length <= width) return str;
  return chars.slice(0, Math.max(0, width - 1)).join("") + "…";
}

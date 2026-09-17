// the tools a window can run — every one opens `dom` and `document`
export const tools = [
  { name: "Editor", url: "./demos/views/editor.tsx" },
  { name: "Preview", url: "./demos/views/preview.tsx" },
  { name: "Pdf", url: "./demos/views/pdf.tsx" },
  { name: "Wordcount", url: "./demos/views/wordcount.tsx" },
  { name: "Stats", url: "./demos/views/stats.tsx" },
];

// "./demos/views/editor.tsx" → "Editor"
export function componentName(url: string): string {
  const base = url
    .split("/")
    .pop()!
    .replace(/\.tsx?$/, "");
  return base[0].toUpperCase() + base.slice(1);
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /\w/.test(w)).length;
}

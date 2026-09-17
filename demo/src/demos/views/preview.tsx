import { marked } from "marked";
import type { Directory } from "@ninepatch/core";
import type { MarkdownDoc } from "../../types";

export default async function Preview(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<MarkdownDoc>("document");

  const host = dom.value.appendChild(document.createElement("div"));
  host.className = "md-preview";
  const unsub = doc.subscribe((d) => {
    host.innerHTML = marked.parse(d.content ?? "", { async: false });
  });
  dir.signal.addEventListener("abort", () => {
    unsub();
    host.remove();
  });
}

import { from } from "solid-js";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import type { MarkdownDoc } from "../../types";
import { countWords } from "./tools";

export default async function Wordcount(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<MarkdownDoc>("document");

  const dispose = render(() => {
    const state = from(doc, doc.value);
    return (
      <div class="count">
        <span class="count-number">{countWords(state().content ?? "")}</span>
        <span class="count-label">words</span>
      </div>
    );
  }, dom.value);
  dir.signal.addEventListener("abort", dispose);
}

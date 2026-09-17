import { For, from } from "solid-js";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import type { MarkdownDoc } from "../../types";
import { countWords } from "./tools";

export default async function Stats(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<MarkdownDoc>("document");

  const dispose = render(() => {
    const state = from(doc, doc.value);
    const rows = () => {
      const text = state().content ?? "";
      const words = countWords(text);
      return [
        ["words", String(words)],
        ["characters", String(text.length)],
        ["lines", String(text.split("\n").length)],
        ["headings", String(text.match(/^#+\s/gm)?.length ?? 0)],
        ["links", String(text.match(/\[[^\]]*\]\([^)]*\)/g)?.length ?? 0)],
        ["reading time", `${Math.max(1, Math.ceil(words / 200))} min`],
      ];
    };
    return (
      <table class="stats">
        <tbody>
          <For each={rows()}>
            {([label, value]) => (
              <tr>
                <th>{label}</th>
                <td>{value}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    );
  }, dom.value);
  dir.signal.addEventListener("abort", dispose);
}

import { marked } from "marked";
import type { Directory } from "@ninepatch/core";
import type { MarkdownDoc } from "../../types";

const PAGE = { w: 200, h: 283, pad: 18 }; // an A-series sheet, in pixels

// the document as printed: the rendered html measured once, then shown
// through as many page-sized windows as it needs, each scrolled to its
// own part of the flow
export default async function Pdf(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<MarkdownDoc>("document");

  const host = dom.value.appendChild(document.createElement("div"));
  host.className = "pdf";
  const clip = host.appendChild(document.createElement("div"));
  clip.className = "pdf-clip"; // keeps the measurer out of the scroll
  const measure = clip.appendChild(document.createElement("div"));
  measure.className = "pdf-measure";
  measure.style.width = `${PAGE.w - 2 * PAGE.pad}px`;
  const sheets = host.appendChild(document.createElement("div"));
  sheets.className = "pdf-sheets";

  let html = "";
  const paginate = () => {
    const inner = PAGE.h - 2 * PAGE.pad;
    const pages = Math.max(1, Math.ceil(measure.offsetHeight / inner));
    sheets.replaceChildren();
    for (let i = 0; i < pages; i++) {
      const page = sheets.appendChild(document.createElement("div"));
      page.className = "pdf-page";
      page.style.width = `${PAGE.w}px`;
      page.style.height = `${PAGE.h}px`;
      page.style.padding = `${PAGE.pad}px`;
      const flow = page.appendChild(document.createElement("div"));
      flow.className = "pdf-flow";
      flow.style.transform = `translateY(${-i * inner}px)`;
      flow.innerHTML = html;
      const number = page.appendChild(document.createElement("span"));
      number.className = "pdf-number";
      number.textContent = String(i + 1);
    }
  };
  const observer = new ResizeObserver(paginate);
  observer.observe(measure);
  const unsub = doc.subscribe((d) => {
    html = marked.parse(d.content ?? "", { async: false });
    measure.innerHTML = html;
    paginate();
  });
  dir.signal.addEventListener("abort", () => {
    unsub();
    observer.disconnect();
    host.remove();
  });
}

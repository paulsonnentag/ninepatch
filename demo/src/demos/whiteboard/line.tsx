import { from } from "solid-js";
import { render } from "solid-js/web";
import type { Directory } from "@ninepatch/core";
import type { Stroke } from "../../types";
import { points } from "./geometry";

// A shape that draws its outline as a polyline, in whatever units the
// surface it sits on uses — pixels on the canvas, map units on the map.
export default async function Line(dir: Directory) {
  const dom = await dir.open<Element>("dom");
  const doc = await dir.open<Stroke>("document");

  const dispose = render(() => {
    const stroke = from(doc, doc.value);
    return (
      <svg class="stroke">
        <polyline
          points={points(stroke()?.outline ?? [])}
          fill="none"
          stroke={stroke()?.color}
          stroke-width={stroke()?.width}
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    );
  }, dom.value);
  dir.signal.addEventListener("abort", dispose);
}

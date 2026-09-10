/** §2/§3. The map never learns what a canvas is: it opens `places` and
 * gets a list shaped the way it wants — the host derived it. Pins share
 * the `selection` entry with whoever else holds it. */

import { For } from "solid-js"
import { createOpen, createValue, tool } from "@ninepatch/solid"
import type { Place } from "../types"

export const MapView = tool(() => {
  const places = createValue(createOpen<Place[]>("places"))
  const selection = createOpen<string | null>("selection")
  const selected = createValue(selection)

  return (
    <svg class="map" viewBox="0 0 360 180">
      <For each={CONTINENTS}>
        {(poly) => <polygon class="land" points={poly.map(([lat, lng]) => `${lng + 180},${90 - lat}`).join(" ")} />}
      </For>
      <For each={places() ?? []}>
        {(place) => (
          <g
            class="pin"
            classList={{ selected: selected() === place.id }}
            transform={`translate(${place.lng + 180}, ${90 - place.lat})`}
            onClick={() => selection()?.set(place.id)}
          >
            <circle class="hit" r="8" />
            <circle r="3" />
            <text y="-5">{place.title}</text>
          </g>
        )}
      </For>
    </svg>
  )
})

// Rough low-poly continents, [lat, lng] vertices. Recognizable, not accurate.
const CONTINENTS: [number, number][][] = [
  // North America
  [[71, -160], [70, -110], [62, -70], [47, -52], [30, -80], [18, -95], [22, -106], [32, -117], [55, -160]],
  // Greenland
  [[83, -40], [76, -20], [60, -44], [76, -70]],
  // South America
  [[12, -72], [5, -50], [-8, -35], [-35, -55], [-55, -70], [-18, -71], [0, -80]],
  // Africa
  [[35, -8], [32, 32], [12, 44], [-2, 42], [-35, 20], [-17, 12], [5, -10], [15, -18]],
  // Eurasia
  [[36, -10], [58, -5], [71, 25], [77, 105], [66, 180], [55, 158], [35, 122], [22, 108], [8, 100], [24, 62], [30, 34], [38, 12]],
  // Australia
  [[-12, 131], [-20, 148], [-38, 147], [-33, 116], [-21, 114]],
]

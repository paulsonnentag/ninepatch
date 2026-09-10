/** §4. The route rendered in the page as an input that looks like a URL
 * bar. It only accepts documents from the seed folder — it opens `demo`
 * and checks. */

import { For } from "solid-js"
import { createOpen, createValue, tool } from "@ninepatch/solid"
import type { Folder, Route } from "../types"

export const UrlBar = tool(() => {
  const location = createOpen<Route>("location")
  const route = createValue(location)
  const known = createValue(createOpen<Folder>("demo"))

  const go = (url: string) => {
    if (Object.values(known() ?? {}).includes(url)) location()!.set({ ...route()!, docUrl: url })
  }

  return (
    <>
      <input
        class="urlbar"
        list="ninepatch-docs"
        value={route()?.docUrl ?? ""}
        onChange={(e) => go(e.currentTarget.value)}
      />
      <datalist id="ninepatch-docs">
        <For each={Object.values(known() ?? {})}>{(url) => <option value={url} />}</For>
      </datalist>
    </>
  )
})

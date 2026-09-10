import { Show, type JSX } from "solid-js"

export function Section(props: { title: string; prose: JSX.Element; source?: string; children: JSX.Element }) {
  return (
    <section>
      <h2>{props.title}</h2>
      <div class="prose">{props.prose}</div>
      <div class="live">{props.children}</div>
      <Show when={props.source}>
        <details>
          <summary>source</summary>
          <pre>
            <code>{props.source}</code>
          </pre>
        </details>
      </Show>
    </section>
  )
}

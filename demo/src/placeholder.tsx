import { createSignal, onCleanup, Show } from "solid-js";

const SLOW_MS = 10_000;

// a demo's place on the page before it has loaded: its title over an
// empty band, so the page reads whole while the documents come in; a
// demo that failed says so in the band
export function Placeholder(props: { title: string; error?: unknown }) {
  const [slow, setSlow] = createSignal(false);
  const timer = setTimeout(() => setSlow(true), SLOW_MS);
  onCleanup(() => clearTimeout(timer));
  return (
    <section class="demo">
      <h3 class="demo-title">{props.title}</h3>
      <div class="panels placeholder" classList={{ failed: !!props.error }}>
        <Show
          when={props.error === undefined}
          fallback={
            <div class="placeholder-note">
              <b>failed to load</b>
              <pre>{describe(props.error)}</pre>
            </div>
          }
        >
          <div class="placeholder-note">
            <span class="loading">loading…</span>
            <Show when={slow()}>
              <span class="placeholder-slow">
                still waiting — on the documents from storage, or on another tab
                that holds them. A reload usually helps.
              </span>
            </Show>
          </div>
        </Show>
      </div>
    </section>
  );
}

function describe(e: unknown): string {
  if (e instanceof Error) return e.stack ?? e.message;
  return String(e);
}

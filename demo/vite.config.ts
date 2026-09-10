import { defineConfig } from "vite"
import solid from "vite-plugin-solid"
import wasm from "vite-plugin-wasm"

export default defineConfig({
  plugins: [solid(), wasm()],
  build: { target: "esnext" },
  optimizeDeps: {
    // Only the wasm carrier: pre-bundling would inline the .wasm import.
    // automerge-repo and the adapters pre-bundle normally (they have CJS
    // deps like eventemitter3 that need the interop).
    exclude: ["@automerge/automerge"],
  },
})

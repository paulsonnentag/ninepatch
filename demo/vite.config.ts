import { defineConfig, type Plugin } from "vite";
import solid from "vite-plugin-solid";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  plugins: [solid(), wasm(), feeds()],
  build: { target: "esnext" },
  server: { hmr: false }, // reload by hand: a half-swapped module tree is not a directory tree
  optimizeDeps: {
    // Only the wasm carrier: pre-bundling would inline the .wasm import.
    // automerge-repo and the adapters pre-bundle normally (they have CJS
    // deps like eventemitter3 that need the interop).
    // maplibre-gl: pre-bundling 404s its worker chunk — no worker, no tiles.
    exclude: ["@automerge/automerge", "maplibre-gl"],
  },
});

// feed hosts don't send CORS headers: /feeds/<host>/<path> fetches
// https://<host>/<path> through the dev server
function feeds(): Plugin {
  return {
    name: "feeds",
    configureServer(server) {
      server.middlewares.use("/feeds", async (req, res) => {
        try {
          const { url } = req as { url?: string }; // past the /feeds prefix: /<host>/<path>
          const upstream = await fetch(`https:/${url}`);
          res.statusCode = upstream.status;
          res.setHeader(
            "content-type",
            upstream.headers.get("content-type") ?? "application/xml"
          );
          res.end(new Uint8Array(await upstream.arrayBuffer()));
        } catch (e) {
          res.statusCode = 502;
          res.end(String(e));
        }
      });
    },
  };
}

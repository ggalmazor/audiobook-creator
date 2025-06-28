import {defineConfig} from "vite";
import deno from "@deno/vite-plugin";
import preact from "@preact/preset-vite";

const host = Deno.env.get("TAURI_DEV_HOST");
const hmr = host ? { protocol: "ws", host, port: 1421 } : undefined;
const target = Deno.env.get("TAURI_ENV_PLATFORM") == "windows"
  ? "chrome105"
  : "safari13";
const minify = !Deno.env.get("TAURI_ENV_DEBUG") ? "esbuild" : false;
const sourcemap = !!Deno.env.get("TAURI_ENV_DEBUG");

export default defineConfig({
  plugins: [deno(), preact()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host,
    hmr: hmr,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: target,
    minify: minify,
    sourcemap: sourcemap,
  },
});

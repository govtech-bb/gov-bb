import { basename, dirname, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { build } from "vite";

const root = resolve(import.meta.dirname, "../..");

export async function buildBrowserFixture(entry, bundle) {
  await build({
    configFile: false,
    root,
    plugins: [tailwindcss(), react()],
    define: { "process.env.NODE_ENV": JSON.stringify("development") },
    logLevel: "warn",
    build: {
      outDir: dirname(bundle),
      emptyOutDir: true,
      minify: false,
      lib: {
        entry: resolve(root, entry),
        name: "EditorFixture",
        formats: ["iife"],
        fileName: () => basename(bundle),
        cssFileName: "fixture",
      },
    },
  });
}

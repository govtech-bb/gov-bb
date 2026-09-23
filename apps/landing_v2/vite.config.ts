import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The site is server-rendered; the editor is not.
 *
 * They shared one origin while the database was PGlite, because IndexedDB is
 * scoped per origin and neither could see the other's data otherwise. With
 * `api_v2` serving both over HTTP that constraint is gone, and the two apps
 * want opposite things: a citizen's page should arrive as finished HTML,
 * and an authoring surface with a rich text editor and local drafts gains
 * nothing from being rendered on a server.
 */
export default defineConfig({
  root: import.meta.dirname,
  plugins: [tailwindcss(), nitro(), tanstackStart(), viteReact()],
  server: { port: 3030 },
});

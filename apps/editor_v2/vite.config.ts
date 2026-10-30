import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // block-kit's source, as tsconfig's paths map it: no prior build needed
  resolve: {
    alias: {
      "@govtech-bb/block-kit/contact": fileURLToPath(
        new URL("../../packages/block-kit/src/contact.ts", import.meta.url),
      ),
    },
  },
  plugins: [tailwindcss(), tanstackStart({ spa: { enabled: true } }), react()],
  server: { port: Number(process.env.PORT) || 3000, strictPort: true },
});

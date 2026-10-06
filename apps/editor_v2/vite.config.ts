import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), tanstackStart({ spa: { enabled: true } }), react()],
  server: { port: Number(process.env.PORT) || 3000, strictPort: true },
});

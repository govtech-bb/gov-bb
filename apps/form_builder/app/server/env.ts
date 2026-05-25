import { z } from "zod";

const isProd = process.env.NODE_ENV === "production";

const schema = z.object({
  ADMIN_API_TOKEN: isProd ? z.string().min(32) : z.string().min(32).optional(),
});

// Each `process.env.X` is a literal so Vite's `define` substitution in
// vite.config.ts can bake the value into the SSR bundle at build time.
// Passing `process.env` directly would leave the field undefined at runtime
// on Amplify Hosting Compute (no env-var passthrough to the SSR Lambda).
export const env = schema.parse({
  ADMIN_API_TOKEN: process.env.ADMIN_API_TOKEN,
});

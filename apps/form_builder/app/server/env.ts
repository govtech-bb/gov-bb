import { z } from "zod";

const isProd = process.env.NODE_ENV === "production";

const schema = z.object({
  ADMIN_API_TOKEN: isProd ? z.string().min(32) : z.string().min(32).optional(),
});

export const env = schema.parse(process.env);

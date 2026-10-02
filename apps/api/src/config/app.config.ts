import { registerAs } from "@nestjs/config";

export default registerAs("app", () => ({
  port: parseInt(process.env.API_PORT ?? "3001", 10),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",

  // Public landing site origin for the `{landingUrl}` confirmation token
  // (EmailBodyBuilder). Left undefined when unset so form-conditions applies
  // its shared prod fallback — the same fallback the forms app's LANDING_URL
  // uses, so the page and the email resolve the token identically.
  landingUrl: process.env.LANDING_BASE_URL,
}));

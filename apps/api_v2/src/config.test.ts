import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { parseConfig } from "./config";

const required = {
  BETTER_AUTH_URL: "http://localhost:3020",
  EDITOR_ORIGIN: "http://localhost:3000",
  BETTER_AUTH_SECRET: "test-only-secret-with-at-least-32-characters",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
};

describe("auth configuration", () => {
  it("fails closed without required settings and never prints their values", () => {
    const missing = parseConfig({});
    expect(missing.ok).toBe(false);
    const invalid = parseConfig({ ...required, BETTER_AUTH_SECRET: "short" });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok)
      expect(invalid.error.message).toBe(
        "Invalid configuration: BETTER_AUTH_SECRET",
      );
  });
  it("rejects non-origin URLs and requires HTTPS in production", () => {
    expect(parseConfig({ ...required, BETTER_AUTH_URL: "not a URL" }).ok).toBe(
      false,
    );
    expect(
      parseConfig({ ...required, EDITOR_ORIGIN: "https://editor.example/path" })
        .ok,
    ).toBe(false);
    expect(parseConfig({ ...required, NODE_ENV: "production" }).ok).toBe(false);
    expect(
      parseConfig({
        ...required,
        NODE_ENV: "production",
        EDITOR_ORIGIN: "https://editor.example",
        BETTER_AUTH_URL: "https://api.example",
      }).ok,
    ).toBe(true);
  });
  it("keeps existing runtime defaults while redacting all credential representations", () => {
    const result = parseConfig(required);
    if (!result.ok) throw result.error;
    expect(result.value).toMatchObject({
      port: 3020,
      seed: true,
      database: { host: "localhost", port: 5432, database: "gov_bb_v2" },
    });
    expect(result.value.auth.secret.reveal()).toBe(required.BETTER_AUTH_SECRET);
    for (const rendered of [
      JSON.stringify(result.value),
      inspect(result.value),
      String(result.value.auth.secret),
    ]) {
      expect(rendered).not.toContain(required.BETTER_AUTH_SECRET);
      expect(rendered).not.toContain(required.GOOGLE_CLIENT_SECRET);
    }
  });
});

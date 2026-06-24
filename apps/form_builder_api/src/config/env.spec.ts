import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

// A minimal prod env that satisfies the production guard, so individual tests
// can drop one field to assert that field is what fails.
const PROD = {
  NODE_ENV: "production",
  ADMIN_API_TOKEN: "secret",
  GITHUB_ORG: "govtech-bb",
  CORS_ORIGIN: "https://forms.gov.bb",
};

describe("parseEnv", () => {
  it("applies defaults that mirror the current process.env reads", () => {
    const env = parseEnv({});
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3003);
    expect(env.BUILDER_RATE_LIMIT).toBe(120);
    expect(env.DB_HOST).toBe("localhost");
    expect(env.DB_PORT).toBe(5432);
    expect(env.DB_USERNAME).toBe("postgres");
    expect(env.DB_PASSWORD).toBe("postgres");
    expect(env.DB_NAME).toBe("modular_forms");
    expect(env.DB_SYNCHRONIZE).toBe(false);
    expect(env.DB_LOGGING).toBe(false);
    expect(env.AWS_REGION).toBe("ca-central-1");
    expect(env.AI_MODEL).toBe(
      "global.anthropic.claude-haiku-4-5-20251001-v1:0",
    );
    expect(env.PUBLISH_BASE_BRANCH).toBe("dev");
  });

  it("coerces numeric vars from strings", () => {
    const env = parseEnv({
      PORT: "8080",
      DB_PORT: "6543",
      BUILDER_RATE_LIMIT: "50",
    });
    expect(env.PORT).toBe(8080);
    expect(env.DB_PORT).toBe(6543);
    expect(env.BUILDER_RATE_LIMIT).toBe(50);
  });

  it("rejects a non-numeric / non-positive port", () => {
    expect(() => parseEnv({ PORT: "not-a-number" })).toThrow();
    expect(() => parseEnv({ PORT: "0" })).toThrow();
  });

  it('transforms the DB boolean flags via the literal "true"', () => {
    const env = parseEnv({ DB_SYNCHRONIZE: "true", DB_LOGGING: "true" });
    expect(env.DB_SYNCHRONIZE).toBe(true);
    expect(env.DB_LOGGING).toBe(true);
    // Anything other than the literal "true" is false (mirrors `=== "true"`).
    expect(parseEnv({ DB_SYNCHRONIZE: "1" }).DB_SYNCHRONIZE).toBe(false);
  });

  it("keeps prod-only secrets optional in development", () => {
    const env = parseEnv({ NODE_ENV: "development" });
    expect(env.ADMIN_API_TOKEN).toBeUndefined();
    expect(env.GITHUB_ORG).toBeUndefined();
    expect(env.CORS_ORIGIN).toBeUndefined();
  });

  it("accepts a fully-configured production env", () => {
    expect(() => parseEnv(PROD)).not.toThrow();
  });

  it("fails fast when ADMIN_API_TOKEN is missing in production", () => {
    expect(() => parseEnv({ ...PROD, ADMIN_API_TOKEN: undefined })).toThrow(
      /ADMIN_API_TOKEN/,
    );
  });

  it("fails fast when GITHUB_ORG is missing in production", () => {
    expect(() => parseEnv({ ...PROD, GITHUB_ORG: undefined })).toThrow(
      /GITHUB_ORG/,
    );
  });

  it("fails fast when CORS_ORIGIN is unset, wildcard, or localhost in production", () => {
    expect(() => parseEnv({ ...PROD, CORS_ORIGIN: undefined })).toThrow(
      /CORS_ORIGIN/,
    );
    expect(() => parseEnv({ ...PROD, CORS_ORIGIN: "*" })).toThrow(
      /CORS_ORIGIN/,
    );
    expect(() =>
      parseEnv({ ...PROD, CORS_ORIGIN: "http://localhost:5173" }),
    ).toThrow(/CORS_ORIGIN/);
  });
});

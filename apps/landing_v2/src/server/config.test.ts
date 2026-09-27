import { describe, expect, it } from "vitest";
import { resolveApiV2Url, resolveFormsUrl } from "./config";

describe.each([
  ["resolveApiV2Url", resolveApiV2Url, "API_V2_URL", "http://localhost:3020"],
  ["resolveFormsUrl", resolveFormsUrl, "FORMS_URL", "http://localhost:3000"],
])("%s", (_name, resolve, variable, devDefault) => {
  it("prefers the runtimeConfig value over the env value", () => {
    expect(
      resolve("https://config.example", "https://env.example", false),
    ).toBe("https://config.example");
  });

  it("falls back to the env value when runtimeConfig is empty", () => {
    expect(resolve("", "https://env.example", false)).toBe(
      "https://env.example",
    );
    expect(resolve(undefined, "https://env.example", false)).toBe(
      "https://env.example",
    );
  });

  it(`falls back to ${devDefault} under vite dev when neither is set`, () => {
    expect(resolve(undefined, undefined, true)).toBe(devDefault);
    expect(resolve("", "", true)).toBe(devDefault);
  });

  it(`throws naming ${variable} in production when neither is set`, () => {
    const notSet = new RegExp(`^${variable} is not set\\.`);
    expect(() => resolve(undefined, undefined, false)).toThrow(notSet);
    expect(() => resolve("", "", false)).toThrow(notSet);
  });

  it("trims trailing slashes so path concatenation never doubles", () => {
    expect(resolve("https://config.example///", undefined, false)).toBe(
      "https://config.example",
    );
  });
});

import { describe, expect, it } from "vitest";
import { resolveApiV2Url, resolveFormsUrl } from "./config";

describe.each([
  ["resolveApiV2Url", resolveApiV2Url, "http://localhost:3020"],
  ["resolveFormsUrl", resolveFormsUrl, "http://localhost:3000"],
])("%s", (_name, resolve, devDefault) => {
  it("prefers the runtimeConfig value over the env value", () => {
    expect(resolve("https://config.example", "https://env.example")).toBe(
      "https://config.example",
    );
  });

  it("falls back to the env value when runtimeConfig is empty", () => {
    expect(resolve("", "https://env.example")).toBe("https://env.example");
    expect(resolve(undefined, "https://env.example")).toBe(
      "https://env.example",
    );
  });

  it(`falls back to ${devDefault} when neither is set`, () => {
    expect(resolve(undefined, undefined)).toBe(devDefault);
    expect(resolve("", "")).toBe(devDefault);
  });

  it("trims trailing slashes so path concatenation never doubles", () => {
    expect(resolve("https://config.example///", undefined)).toBe(
      "https://config.example",
    );
  });
});

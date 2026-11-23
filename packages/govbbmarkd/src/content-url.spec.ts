import { expect, it } from "vitest";
import {
  isSafeContentUrl,
  isSitePath,
} from "@govtech-bb/govbbmarkd/content-url";

it.each([
  "/",
  "/services/apply",
  "/a?b=1#c",
  "/%2F%2Foutside.test",
  "/a%20b",
  "/café",
])("accepts a same-site navigation path %j", (path) => {
  expect(isSitePath(path)).toBe(true);
  expect(new URL(path, "https://site.test").origin).toBe("https://site.test");
});

it.each([
  "",
  "services/apply",
  "#apply",
  "https://site.test/page",
  "https://outside.test/page",
  "//outside.test/page",
  "/\\outside.test/page",
  "\\outside.test/page",
  "/a\\b",
  " /page",
  "/page ",
  "/a b",
  "/a\u00a0b",
])("rejects an unsafe site path %j", (path) => {
  expect(isSitePath(path)).toBe(false);
});

it.each([...Array.from({ length: 32 }, (_, code) => code), 127])(
  "rejects control character %i at every position",
  (code) => {
    const control = String.fromCharCode(code);
    expect(isSitePath(`${control}/page`)).toBe(false);
    expect(isSitePath(`/a${control}b`)).toBe(false);
    expect(isSitePath(`/page${control}`)).toBe(false);
  },
);

it.each([
  "/services/start",
  "#apply",
  "https://gov.bb",
  "http://example.com",
  "mailto:help@example.com",
  "tel:+12465351000",
  "irc://example.com",
  "ircs://example.com",
  "xmpp:help@example.com",
])("accepts the existing content URL policy: %s", (url) => {
  expect(isSafeContentUrl(url)).toBe(true);
});

it.each([
  "",
  "   ",
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "data:text/html,hello",
  "file:///etc/passwd",
  "/apply\u0000now",
  "java\tscript:alert(1)",
  "/apply\u007fnow",
])("rejects unsafe content URL %j", (url) => {
  expect(isSafeContentUrl(url)).toBe(false);
});

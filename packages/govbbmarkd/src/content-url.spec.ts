import { expect, it } from "vitest";
import { isSafeContentUrl } from "@govtech-bb/govbbmarkd/content-url";

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

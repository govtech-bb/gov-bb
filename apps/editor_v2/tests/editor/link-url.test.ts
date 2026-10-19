import { expect, test } from "vitest";
import {
  isSafeLinkUrl,
  isSupportedLinkUrl,
  normalizeLinkUrl,
} from "../../src/editor/modules/links/url";

test("the reusable toolbar retains other document link schemes and rejects executable addresses", () => {
  expect(isSafeLinkUrl("ftp://example.gov.bb/archive")).toBe(true);
  expect(isSafeLinkUrl("/guidance")).toBe(true);

  for (const value of [
    "javascript:alert(1)",
    " DATA:text/html,test",
    "vbscript:run()",
    "java\tscript:alert(1)",
    "da\tta:text/html,test",
    "java\nscript:alert(1)",
    "vb\rscript:run()",
    "\u0000javascript:alert(1)",
  ])
    expect(isSafeLinkUrl(value)).toBe(false);
});

test("link destinations support page references and the converter's address schemes", () => {
  for (const value of [
    "",
    "/guidance",
    "../before-you-start",
    "#eligibility",
    "?language=en",
    "https://example.gov.bb/help?from=page#contact",
    "http://example.gov.bb",
    "mailto:help@example.gov.bb",
    "tel:+12465350000",
    "irc://example.gov.bb/help",
    "ircs://example.gov.bb/help",
    "xmpp:help@example.gov.bb",
  ])
    expect(isSupportedLinkUrl(value)).toBe(true);
});

test("link destinations reject schemes and whitespace the page converter cannot retain", () => {
  for (const value of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,test",
    "file:///tmp/page.html",
    "//example.gov.bb/help",
    "/guidance with spaces",
    "https://example.gov.bb/\nhelp",
    "\u0000https://example.gov.bb",
    "/guidance\u007f",
  ])
    expect(isSupportedLinkUrl(value)).toBe(false);
});

test("a link is saved as the address the writer means", () => {
  for (const [typed, address] of [
    ["info@health.gov.bb", "mailto:info@health.gov.bb"],
    [" info@health.gov.bb ", "mailto:info@health.gov.bb"],
    ["+1 (246) 535-1000", "tel:+12465351000"],
    ["246-535-1000", "tel:2465351000"],
    ["535 1000", "tel:5351000"],
    ["www.gov.bb/apply", "https://www.gov.bb/apply"],
    ["gov.bb", "https://gov.bb"],
    ["alpha.gov.bb:8080/help", "https://alpha.gov.bb:8080/help"],
    ["localhost:3000", "https://localhost:3000"],
  ] as const)
    expect(normalizeLinkUrl(typed)).toBe(address);
});

test("an address with a scheme, a relative path, or anything that isn't an address stays as typed", () => {
  for (const value of [
    "https://www.gov.bb/apply",
    "mailto:info@health.gov.bb",
    "tel:+12465351000",
    "/guidance",
    "../before-you-start",
    "docs/guide.pdf",
    "#eligibility",
    "?language=en",
    "before-you-start",
    "",
    "123",
    "Section 2.1",
  ])
    expect(normalizeLinkUrl(value)).toBe(value);
});

import { expect, test } from "vitest";
import { isSafeLinkUrl, isSupportedLinkUrl } from "../../src/editor/modules/links/url";

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

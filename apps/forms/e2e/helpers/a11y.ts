import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Shared helper for the live accessibility scan (playwright.a11y.config.ts).
 *
 * The gate fails only on `serious`/`critical` violations: those are the
 * impact levels that block or seriously impede assistive-tech users (missing
 * labels, unlabelled controls, insufficient colour contrast, keyboard traps).
 * `minor`/`moderate` findings (e.g. heading-order) are surfaced in the log but
 * don't fail the build yet, so the gate can land green and tighten over time.
 */
const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

/** WCAG 2.0/2.1 Level A + AA — the conformance target for the platform. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Run axe against the currently-loaded page and fail the test if any
 * serious/critical WCAG A/AA violation is present. On failure the assertion
 * message lists each violation (rule, impact, help URL, first offending nodes)
 * so a CI log is actionable without downloading the trace.
 */
export async function scanForA11y(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

  const blocking = results.violations.filter(
    (v) => v.impact != null && BLOCKING_IMPACTS.has(v.impact),
  );

  const report = blocking
    .map((v) => {
      const nodes = v.nodes
        .slice(0, 5)
        .map((n) => `      - ${n.target.join(" ")}`)
        .join("\n");
      return `  [${v.impact}] ${v.id} — ${v.help}\n    ${v.helpUrl}\n${nodes}`;
    })
    .join("\n\n");

  expect(
    blocking,
    `${label}: ${blocking.length} serious/critical accessibility violation(s):\n\n${report}`,
  ).toEqual([]);
}

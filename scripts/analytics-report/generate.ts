// Entry point for the Umami analytics HTML report.
//   pnpm analytics:report                 # live: reads env, fetches Umami, writes HTML
//   pnpm analytics:report -- --fixture f.json   # offline: render a prebuilt ReportModel
//   pnpm analytics:report -- --out path.html --top 10
//   pnpm analytics:report -- --debug            # also dump raw Umami responses for the first preset
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadContent } from "@govtech-bb/content";
import { buildPresets } from "./dates";
import {
  aggregateFormEvents,
  buildFormDetail,
  buildFormRows,
  buildPageRows,
  buildSearchReport,
  type FormDetailSource,
} from "./metrics";
import { renderReport } from "./render";
import { UmamiClient, type Range } from "./umami";
import type { FormMeta, PresetReport, ReportModel } from "./types";

interface Args {
  fixture?: string;
  out: string;
  top: number;
  debug: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    out: join("scripts", "analytics-report", "output", "analytics-report.html"),
    top: 10,
    debug: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fixture") args.fixture = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--top") args.top = Number(argv[++i]) || args.top;
    else if (a === "--debug") args.debug = true;
  }
  return args;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v)
    throw new Error(`Missing required env var ${name} (see .env.example)`);
  return v;
}

/** form_id → { title, category } from landing content frontmatter. */
async function loadFormMeta(): Promise<Map<string, FormMeta>> {
  const { services } = await loadContent();
  const meta = new Map<string, FormMeta>();
  for (const s of services) {
    if (!s.form_id) continue;
    meta.set(s.form_id, {
      title: s.title ?? s.form_id,
      category: s.categories?.[0] ?? s.category ?? "uncategorised",
    });
  }
  return meta;
}

async function buildPresetReport(
  client: UmamiClient,
  landingId: string,
  formsId: string,
  meta: Map<string, FormMeta>,
  preset: { key: string; label: string; range: Range },
  top: number,
): Promise<PresetReport> {
  const { range } = preset;
  const pageRowsRaw = await client.metricsUrls(landingId, range);
  const eventRows = await client.metricsEvents(formsId, range);
  const pages = buildPageRows(pageRowsRaw, top);

  const agg = aggregateFormEvents(eventRows);
  // Pick the top forms by starts, then pull their event-data for the detail.
  const topFormIds = [...agg.entries()]
    .sort(
      (a, b) =>
        (b[1].counts["form-start"] ?? 0) - (a[1].counts["form-start"] ?? 0),
    )
    .slice(0, top)
    .map(([id]) => id);

  const details = new Map<string, FormDetailSource>();
  for (const formId of topFormIds) {
    const ve = `${formId}:form-validation-error`;
    const duration = await client.eventDataValues(
      formsId,
      `${formId}:form-submit`,
      "duration_seconds",
      range,
    );
    const errorCount = await client.eventDataValues(
      formsId,
      ve,
      "errorCount",
      range,
    );
    const fields = await client.eventDataValues(formsId, ve, "fields", range);
    const errorTypes = await client.eventDataValues(
      formsId,
      ve,
      "errorTypes",
      range,
    );
    details.set(formId, { duration, errorCount, fields, errorTypes });
  }

  const forms = buildFormRows(agg, meta, details, top);
  const detailRecord: Record<string, ReturnType<typeof buildFormDetail>> = {};
  for (const formId of topFormIds) {
    const entry = agg.get(formId);
    if (entry)
      detailRecord[formId] = buildFormDetail(
        formId,
        entry,
        details.get(formId),
      );
  }

  // Search (landing): query frequency + zero-results rate from the `search`
  // event's property distributions.
  const searchQueries = await client.eventDataValues(
    landingId,
    "search",
    "query",
    range,
  );
  const searchResults = await client.eventDataValues(
    landingId,
    "search",
    "results",
    range,
  );
  const search = buildSearchReport(searchQueries, searchResults, top);

  return {
    key: preset.key,
    label: preset.label,
    pages,
    forms,
    details: detailRecord,
    search,
  };
}

async function buildLiveModel(args: Args): Promise<ReportModel> {
  const timezone = process.env.UMAMI_TIMEZONE ?? "America/Barbados";
  const client = new UmamiClient({
    apiKey: requireEnv("UMAMI_API_KEY"),
    baseUrl: process.env.UMAMI_API_URL,
  });
  const landingId = requireEnv("UMAMI_LANDING_WEBSITE_ID");
  const formsId = requireEnv("UMAMI_FORMS_WEBSITE_ID");
  const meta = await loadFormMeta();
  const now = new Date();
  const presets = buildPresets(timezone, now);

  // --debug: dump the raw Umami responses (and /stats totals) for the first
  // preset so the numbers can be compared directly against the dashboard for
  // the same range, to pin down any metric-semantics mismatch.
  if (args.debug) {
    const p0 = presets[0];
    const debug = {
      note: "Raw Umami responses for the first preset. Compare /stats + metrics to the Umami dashboard for the SAME date range. Note: /metrics `y` is visitor count, not pageviews/total-events.",
      preset: p0,
      landingStats: await client.stats(landingId, p0.range),
      formsStats: await client.stats(formsId, p0.range),
      pagesRaw: await client.metricsUrls(landingId, p0.range),
      eventsRaw: await client.metricsEvents(formsId, p0.range),
    };
    await mkdir(dirname(args.out), { recursive: true });
    await writeFile(`${args.out}.debug.json`, JSON.stringify(debug, null, 2));
    process.stderr.write(`  wrote raw diagnostics to ${args.out}.debug.json\n`);
  }

  const reports: PresetReport[] = [];
  for (const preset of presets) {
    process.stderr.write(`  fetching ${preset.label}…\n`);
    reports.push(
      await buildPresetReport(
        client,
        landingId,
        formsId,
        meta,
        preset,
        args.top,
      ),
    );
  }
  return { generatedAt: now.toISOString(), timezone, presets: reports };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const model: ReportModel = args.fixture
    ? JSON.parse(await readFile(args.fixture, "utf8"))
    : await buildLiveModel(args);

  const html = renderReport(model);
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, html, "utf8");
  process.stdout.write(`Wrote report to ${args.out}\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

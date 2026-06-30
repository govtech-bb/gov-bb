// Entry point for the Umami analytics HTML report.
//   pnpm analytics:report                 # live: reads env, fetches Umami, writes HTML
//   pnpm analytics:report -- --fixture f.json   # offline: render a prebuilt ReportModel
//   pnpm analytics:report -- --out path.html --top 25
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadContent } from "@govtech-bb/content";
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
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    out: join("scripts", "analytics-report", "output", "analytics-report.html"),
    top: 20,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fixture") args.fixture = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--top") args.top = Number(argv[++i]) || args.top;
  }
  return args;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v)
    throw new Error(`Missing required env var ${name} (see .env.example)`);
  return v;
}

/** ms that `timeZone` is ahead of UTC at the given instant. */
function tzOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(
    dtf.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const asUTC = Date.UTC(
    +p.year,
    +p.month - 1,
    +p.day,
    +p.hour,
    +p.minute,
    +p.second,
  );
  return asUTC - date.getTime();
}

function startOfTodayInTz(timeZone: string, now: Date): number {
  const off = tzOffsetMs(timeZone, now);
  const tzNow = new Date(now.getTime() + off);
  const wallMidnight = Date.UTC(
    tzNow.getUTCFullYear(),
    tzNow.getUTCMonth(),
    tzNow.getUTCDate(),
  );
  return wallMidnight - off;
}

function buildPresets(
  timeZone: string,
  now: Date,
): { key: string; label: string; range: Range }[] {
  const end = now.getTime();
  const day = 86_400_000;
  const rolling = (n: number) => ({ startAt: end - n * day, endAt: end });
  return [
    {
      key: "today",
      label: "Today",
      range: { startAt: startOfTodayInTz(timeZone, now), endAt: end },
    },
    { key: "last-7-days", label: "Last 7 days", range: rolling(7) },
    { key: "last-30-days", label: "Last 30 days", range: rolling(30) },
    { key: "last-60-days", label: "Last 60 days", range: rolling(60) },
    { key: "last-90-days", label: "Last 90 days", range: rolling(90) },
  ];
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

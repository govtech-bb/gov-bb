// Orchestration: fetch from Umami + assemble the full ReportModel (event-based
// presets + the session-based consolidated report). Shared by the offline
// snapshot generator and the api's scheduled refresher, so the report shape is
// produced in exactly one place.
import { buildPresets } from "./dates";
import {
  aggregateFormEvents,
  buildFormDetail,
  buildFormRows,
  buildPageRows,
  buildSearchReport,
  buildSources,
  type FormDetailSource,
} from "./metrics";
import { aggregateSessions, buildJourneys } from "./sessions";
import type { FormDetail, FormMeta, PresetReport, ReportModel } from "./types";
import type { UmamiClient } from "./umami";

export interface BuildReportOptions {
  landingWebsiteId: string;
  formsWebsiteId: string;
  timezone: string;
  now: Date;
  /** formId → title/category for form rows; empty Map → formId shown as-is. */
  meta?: Map<string, FormMeta>;
  /** top-N rows for pages/forms/queries. */
  topN?: number;
  /** top-N referrers per page. */
  topSources?: number;
  /** session-crawl window (days) + cap for the consolidated report. */
  sessionDays?: number;
  sessionMax?: number;
}

async function buildPreset(
  client: UmamiClient,
  o: Required<
    Pick<BuildReportOptions, "landingWebsiteId" | "formsWebsiteId">
  > & {
    meta: Map<string, FormMeta>;
    topN: number;
    topSources: number;
  },
  preset: {
    key: string;
    label: string;
    range: { startAt: number; endAt: number };
  },
): Promise<PresetReport> {
  const pages = buildPageRows(
    await client.metricsUrls(o.landingWebsiteId, preset.range),
    o.topN,
  );
  for (const page of pages) {
    page.topSources = buildSources(
      await client.metricsReferrers(
        o.landingWebsiteId,
        page.path,
        preset.range,
      ),
      o.topSources,
    );
  }

  const agg = aggregateFormEvents(
    await client.metricsEvents(o.formsWebsiteId, preset.range),
  );
  const topFormIds = [...agg.entries()]
    .sort(
      (a, b) =>
        (b[1].counts["form-start"] ?? 0) - (a[1].counts["form-start"] ?? 0),
    )
    .slice(0, o.topN)
    .map(([formId]) => formId);

  const details = new Map<string, FormDetailSource>();
  const detailModels: Record<string, FormDetail> = {};
  for (const formId of topFormIds) {
    const ve = `${formId}:form-validation-error`;
    const source: FormDetailSource = {
      duration: await client.eventDataValues(
        o.formsWebsiteId,
        `${formId}:form-submit`,
        "duration_seconds",
        preset.range,
      ),
      errorCount: await client.eventDataValues(
        o.formsWebsiteId,
        ve,
        "errorCount",
        preset.range,
      ),
      fields: await client.eventDataValues(
        o.formsWebsiteId,
        ve,
        "fields",
        preset.range,
      ),
      errorTypes: await client.eventDataValues(
        o.formsWebsiteId,
        ve,
        "errorTypes",
        preset.range,
      ),
    };
    details.set(formId, source);
    detailModels[formId] = buildFormDetail(formId, agg.get(formId)!, source);
  }

  const forms = buildFormRows(agg, o.meta, details, o.topN);

  const search = buildSearchReport(
    await client.eventDataValues(
      o.landingWebsiteId,
      "search",
      "query",
      preset.range,
    ),
    await client.eventDataValues(
      o.landingWebsiteId,
      "search",
      "results",
      preset.range,
    ),
    await client.eventDataValues(
      o.landingWebsiteId,
      "search-submit",
      "query",
      preset.range,
    ),
    await client.eventDataValues(
      o.landingWebsiteId,
      "search-submit",
      "source",
      preset.range,
    ),
    o.topN,
  );

  return {
    key: preset.key,
    label: preset.label,
    pages,
    forms,
    details: detailModels,
    search,
  };
}

/**
 * Fetch from Umami and assemble the full ReportModel — every date-range preset
 * (event-based) plus the session-based consolidated report. Fetching is
 * throttled + retried by the client; a preset that throws is skipped rather
 * than failing the whole build. The session crawl runs once for its window.
 */
export async function buildReportModel(
  client: UmamiClient,
  opts: BuildReportOptions,
): Promise<ReportModel> {
  const meta = opts.meta ?? new Map<string, FormMeta>();
  const topN = opts.topN ?? 10;
  const topSources = opts.topSources ?? 3;
  const sessionDays = opts.sessionDays ?? 7;
  const sessionMax = opts.sessionMax ?? 500;

  const presets: PresetReport[] = [];
  for (const preset of buildPresets(opts.timezone, opts.now)) {
    try {
      presets.push(
        await buildPreset(
          client,
          {
            landingWebsiteId: opts.landingWebsiteId,
            formsWebsiteId: opts.formsWebsiteId,
            meta,
            topN,
            topSources,
          },
          preset,
        ),
      );
    } catch {
      // Skip a failed preset; the rest of the report still assembles.
    }
  }

  const endAt = opts.now.getTime();
  const startAt = endAt - sessionDays * 86_400_000;
  let sessions: ReportModel["sessions"];
  try {
    const raw = await client.collectSessions(
      opts.formsWebsiteId,
      { startAt, endAt },
      { maxSessions: sessionMax },
    );
    sessions = aggregateSessions(buildJourneys(raw), { startAt, endAt });
  } catch {
    sessions = undefined; // session report is optional
  }

  return {
    generatedAt: opts.now.toISOString(),
    timezone: opts.timezone,
    presets,
    ...(sessions ? { sessions } : {}),
  };
}

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  FUNNEL_WINDOW_MIN,
  TOOLS,
  UmamiClient,
  buildFunnelSteps,
  buildVisitFunnelSteps,
  comparisonPeriods,
  eventName,
  funnelHeadline,
  shapeSearch,
  shapeTools,
  shapeWaterAlerts,
  tallyFieldErrors,
  totalFor,
  weightedAverage,
  type EventDataValue,
  type Range,
  type StatsPeriod,
  type Tool,
  type ToolEventRows,
  type ToolId,
} from "@govtech-bb/umami-analytics";
import { sanitizeForLog } from "@/common/log-sanitize";
import { FormDefinitionsService } from "@/forms/form-definitions/form-definitions.service";
import {
  biggestFinishDrops,
  formatChatStats,
  formatFormStats,
  formatSearchStats,
  formatSiteStats,
  formatToolStats,
  periodHeading,
  tallyDeadEnds,
  type ChatPeriod,
  type FormPeriod,
  type SitePeriod,
  type SlackMessage,
  type ToolPeriod,
} from "./stats-message";
import { STATS_TOPICS, suggestFormIds } from "./stats-command";

const TZ = "America/Barbados";
const SLACK_POST_TIMEOUT_MS = 10_000;
/** Slack only ever hands out response URLs on this host. */
const SLACK_RESPONSE_HOST = "hooks.slack.com";
/** A slash command's response_url path: /commands/<team>/<id>/<token>. */
const SLACK_COMMAND_PATH =
  /^\/commands\/([A-Za-z0-9]+)\/(\d+)\/([A-Za-z0-9]+)$/;

/**
 * The response_url to post to, or null when it is not a Slack slash command
 * response URL. The result is rebuilt from the fixed origin and the three
 * encoded path segments, so the request can't choose where it goes (SSRF).
 * CodeQL's server-side SSRF query treats any request-derived path as tainted
 * and only accepts encodeURIComponent as a barrier, hence the encoding.
 */
export function slackResponseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const path = SLACK_COMMAND_PATH.exec(url.pathname);
  if (
    url.protocol !== "https:" ||
    url.host !== SLACK_RESPONSE_HOST ||
    url.username ||
    url.password ||
    url.search ||
    !path
  ) {
    return null;
  }
  const [, team, id, token] = path;
  return `https://hooks.slack.com/commands/${encodeURIComponent(
    team,
  )}/${encodeURIComponent(id)}/${encodeURIComponent(token)}`;
}

interface UmamiConfig {
  apiKey: string;
  landingWebsiteId: string;
  formsWebsiteId: string;
}

/**
 * Builds the Slack /stats replies (#3491) from Umami, using the same funnel
 * definitions as the analytics dashboard. Umami requests run one at a time:
 * UmamiClient's spacing only holds for sequential calls, and the cloud API
 * allows 50 requests per 15 seconds. So replies queue on this service and a
 * second /stats waits for the first rather than both hitting the rate limit
 * (the queue is per API task). A site-wide reply makes one funnel call
 * per form per period, so it takes about a minute; the controller acknowledges
 * Slack first and this posts the result to the command's response_url.
 */
@Injectable()
export class SlackStatsService {
  private readonly logger = new Logger(SlackStatsService.name);
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly config: ConfigService,
    private readonly formDefinitions: FormDefinitionsService,
  ) {}

  isConfigured(): boolean {
    const c = this.umamiConfig();
    return Boolean(c.apiKey && c.landingWebsiteId && c.formsWebsiteId);
  }

  /** Build the reply and post it to Slack, after any reply already queued. Never throws. */
  respond(
    request: { command: string; period: StatsPeriod; formId?: string },
    responseUrl: string,
    now: Date = new Date(),
  ): Promise<void> {
    return this.enqueue(() =>
      this.reply(request, (message) => this.post(responseUrl, message), now),
    );
  }

  /**
   * Post last week's site-wide stats to a channel's incoming webhook (the
   * Monday digest, #3491). The URL comes from config, not a request, so it
   * isn't held to the slash-command response_url shape. Resolves to whether
   * Slack accepted the post. Never throws.
   */
  postWeeklyDigest(
    webhookUrl: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    return this.enqueue(() =>
      this.reply(
        { command: "/stats", period: "week" },
        (message) =>
          this.send(
            webhookUrl,
            typeof message === "string" ? { text: message } : message,
          ),
        now,
      ),
    );
  }

  /** Run after any reply already queued; `job` must never throw. */
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job);
    this.queue = run;
    return run;
  }

  private async reply<T>(
    {
      command,
      period,
      formId,
    }: { command: string; period: StatsPeriod; formId?: string },
    deliver: (message: SlackMessage | string) => Promise<T>,
    now: Date,
  ): Promise<T> {
    let message: SlackMessage | string;
    try {
      message = await this.buildReply(command, period, formId, now);
    } catch (err) {
      this.logger.error(
        `[slack-stats] ${sanitizeForLog(command)} ${period} ${sanitizeForLog(
          formId ?? "",
        )} failed: ${sanitizeForLog(
          err instanceof Error ? err.message : String(err),
        )}`,
      );
      message =
        "⚠️ Sorry, I couldn't get the stats from Umami. Try again in a few minutes.";
    }
    return deliver(message);
  }

  async buildReply(
    command: string,
    period: StatsPeriod,
    formId: string | undefined,
    now: Date,
  ): Promise<SlackMessage | string> {
    if (formId === "chat") return this.chatReply(period, now);
    if (formId === "search") return this.searchReply(period, now);
    const tool = TOOLS.find((t) => t.id === formId);
    if (tool) return this.toolReply(period, tool, now);

    const forms = await this.formDefinitions.findAll();
    const periods = comparisonPeriods(period, TZ, now);
    const heading = periodHeading(period, periods);
    const client = new UmamiClient({ apiKey: this.umamiConfig().apiKey });

    if (!formId) {
      const ids = forms.map((f) => f.formId);
      const current = await this.sitePeriod(client, ids, periods.current);
      const previous = await this.sitePeriod(client, ids, periods.previous);
      return formatSiteStats(heading, command, period, {
        current: current.totals,
        previous: previous.totals,
        biggestDrops: biggestFinishDrops(
          ids.map((id) => ({
            formId: id,
            current: current.byForm.get(id) ?? { starts: 0, completed: 0 },
            previous: previous.byForm.get(id) ?? { starts: 0, completed: 0 },
          })),
        ),
      });
    }

    if (!forms.some((f) => f.formId === formId)) {
      const suggestions = suggestFormIds(formId, [
        ...forms.map((f) => f.formId),
        ...TOOLS.map((t) => t.id),
        ...STATS_TOPICS,
      ]);
      return suggestions.length
        ? `🤔 No form or tool with the ID \`${formId}\`. Did you mean ${suggestions
            .map((s) => `\`${s}\``)
            .join(", ")}?`
        : `🤔 No form or tool with the ID \`${formId}\`. Form IDs are the part of the form's address after /forms/.`;
    }

    const websiteId = this.umamiConfig().formsWebsiteId;
    const contract = await this.formDefinitions.findByFormId({ formId });
    const current = await this.formPeriod(client, formId, periods.current);
    const previous = await this.formPeriod(client, formId, periods.previous);
    const stepViews = await this.eventValues(
      client,
      websiteId,
      eventName(formId, "form-step-view"),
      "step",
      periods.current,
    );
    const fieldErrors = await this.eventValues(
      client,
      websiteId,
      eventName(formId, "form-validation-error"),
      "fieldErrors",
      periods.current,
    );
    const submitErrors = await this.eventValues(
      client,
      websiteId,
      eventName(formId, "form-submit-error"),
      "errors",
      periods.current,
    );

    const viewsByStep = new Map<string, number>();
    for (const v of stepViews) {
      const id = String(v.value);
      viewsByStep.set(id, (viewsByStep.get(id) ?? 0) + v.total);
    }
    const labelByField = new Map<string, string>();
    for (const step of contract.steps) {
      for (const el of (step.elements ?? []) as {
        fieldId?: string;
        label?: string;
      }[]) {
        if (el.fieldId && el.label) labelByField.set(el.fieldId, el.label);
      }
    }
    const topErrors = [
      ...tallyFieldErrors(fieldErrors).map((f) => ({
        label: labelByField.get(f.field) ?? f.field,
        count: f.count,
      })),
      ...submitErrors.map((r) => ({
        label: `submit failed: ${String(r.value)}`,
        count: r.total,
      })),
    ]
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return formatFormStats(heading, {
      formId,
      title: contract.title,
      current,
      previous,
      steps: contract.steps.map((s) => ({
        title: s.title,
        count: viewsByStep.get(s.stepId) ?? 0,
      })),
      topErrors,
    });
  }

  private async sitePeriod(
    client: UmamiClient,
    formIds: string[],
    range: Range,
  ): Promise<{
    totals: SitePeriod;
    byForm: Map<string, { starts: number; completed: number }>;
  }> {
    const { landingWebsiteId, formsWebsiteId } = this.umamiConfig();
    const stats = (await client.stats(landingWebsiteId, range)) as {
      visitors?: number;
    };
    // One event-count request per site, so the reply stays inside the rate limit.
    const { deadEnds, topForm } = tallyDeadEnds(
      await client.metricsEvents(landingWebsiteId, range),
      await client.metricsEvents(formsWebsiteId, range),
      formIds,
    );
    const byForm = new Map<string, { starts: number; completed: number }>();
    const durations: EventDataValue[] = [];
    for (const formId of formIds) {
      const headline = funnelHeadline(
        await client.reportFunnel(formsWebsiteId, {
          steps: buildFunnelSteps(formId),
          window: FUNNEL_WINDOW_MIN,
          range,
        }),
      );
      byForm.set(formId, headline);
      // Only forms someone finished can have a duration; skipping the rest
      // keeps the request count (and the wait) down.
      if (headline.completed > 0) {
        durations.push(
          ...(await this.eventValues(
            client,
            formsWebsiteId,
            eventName(formId, "form-submit"),
            "duration_seconds",
            range,
          )),
        );
      }
    }
    let starts = 0;
    let completed = 0;
    for (const h of byForm.values()) {
      starts += h.starts;
      completed += h.completed;
    }
    return {
      totals: {
        visitors: stats.visitors ?? 0,
        starts,
        completed,
        avgDurationSeconds: weightedAverage(durations),
        deadEnds,
        topDeadEndForm: topForm,
      },
      byForm,
    };
  }

  private async formPeriod(
    client: UmamiClient,
    formId: string,
    range: Range,
  ): Promise<FormPeriod> {
    const { formsWebsiteId } = this.umamiConfig();
    const funnel = (steps: ReturnType<typeof buildFunnelSteps>) =>
      client.reportFunnel(formsWebsiteId, {
        steps,
        window: FUNNEL_WINDOW_MIN,
        range,
      });
    const { starts, completed } = funnelHeadline(
      await funnel(buildFunnelSteps(formId)),
    );
    const visits =
      (await funnel(buildVisitFunnelSteps(formId)))[0]?.visitors ?? 0;
    const durations = await this.eventValues(
      client,
      formsWebsiteId,
      eventName(formId, "form-submit"),
      "duration_seconds",
      range,
    );
    return {
      visits,
      starts,
      completed,
      avgDurationSeconds: weightedAverage(durations),
    };
  }

  /**
   * The landing chat events (#3810): two Umami requests per period. Unlike
   * eventValues, an Umami error is not read as "no events": it reaches
   * reply(), which apologises, so an outage never looks like zero use.
   */
  private async chatReply(
    period: StatsPeriod,
    now: Date,
  ): Promise<SlackMessage> {
    const periods = comparisonPeriods(period, TZ, now);
    const { apiKey, landingWebsiteId } = this.umamiConfig();
    const client = new UmamiClient({ apiKey });
    const counts = async (event: string, propertyName: string, range: Range) =>
      (
        await client.eventDataValues(
          landingWebsiteId,
          event,
          propertyName,
          range,
        )
      ).map((r) => ({ label: String(r.value), count: r.total }));
    const chatPeriod = async (range: Range): Promise<ChatPeriod> => ({
      bySource: await counts("chat-submit", "source", range),
      suggestions: await counts("chat-suggestion", "question", range),
    });
    return formatChatStats(periodHeading(period, periods), {
      current: await chatPeriod(periods.current),
      previous: await chatPeriod(periods.previous),
    });
  }

  /**
   * Landing search (#3809): the calls the dashboard's Search tab makes, shaped
   * by the same shapeSearch, for each period; 7 requests, one at a time. Like
   * chatReply, an Umami error is not read as "no searches": it reaches
   * reply(), which apologises.
   */
  private async searchReply(
    period: StatsPeriod,
    now: Date,
  ): Promise<SlackMessage> {
    const periods = comparisonPeriods(period, TZ, now);
    const { apiKey, landingWebsiteId } = this.umamiConfig();
    const client = new UmamiClient({ apiKey });
    const values = (event: string, propertyName: string, range: Range) =>
      client.eventDataValues(landingWebsiteId, event, propertyName, range);
    const searchPeriod = async (range: Range, noResults: EventDataValue[]) =>
      shapeSearch(
        await values("search", "query", range),
        await values("search", "results", range),
        await values("search-result-click", "query", range),
        noResults,
      );
    const noResults = await values(
      "search-no-results",
      "query",
      periods.current,
    );
    return formatSearchStats(periodHeading(period, periods), {
      current: await searchPeriod(periods.current, noResults),
      // The no-result rows only flag queries; no count for the previous
      // period depends on them, so that call is skipped.
      previous: await searchPeriod(periods.previous, []),
      noResults,
    });
  }

  /**
   * One tool's stats (#3806), compared with the period before. Tool events
   * fire on landing. At most nine requests per period, one at a time. An
   * Umami error on a count reaches reply(), which apologises, so an outage
   * never reads as "no tool events".
   */
  private async toolReply(
    period: StatsPeriod,
    tool: Tool,
    now: Date,
  ): Promise<SlackMessage> {
    const periods = comparisonPeriods(period, TZ, now);
    const client = new UmamiClient({ apiKey: this.umamiConfig().apiKey });
    return formatToolStats(periodHeading(period, periods), {
      tool,
      current: await this.toolPeriod(client, tool, periods.current),
      previous: await this.toolPeriod(client, tool, periods.previous),
    });
  }

  /** One tool's period, shaped by the dashboard's code so the numbers match its Tools tab. */
  private async toolPeriod(
    client: UmamiClient,
    tool: Tool,
    range: Range,
  ): Promise<ToolPeriod> {
    const { landingWebsiteId } = this.umamiConfig();
    const urlRows = await client.metricsUrls(landingWebsiteId, range);
    const rows = await this.toolEventRows(client, [tool], range);
    const [row] = shapeTools([tool], urlRows, new Map(), rows);
    const stepViews = totalFor(
      await client.eventDataValues(
        landingWebsiteId,
        "tool-step-view",
        "tool",
        range,
      ),
      tool.id,
    );
    return {
      visitors: row.visitors,
      events: row.events,
      stepViews,
      steps: await this.toolBreakdown(
        client,
        tool,
        "tool-step-view",
        "step",
        stepViews,
        range,
      ),
      actions: rows.actions.get(tool.id),
      errors: await this.toolBreakdown(
        client,
        tool,
        "tool-error",
        "error",
        row.events?.errors ?? 0,
        range,
      ),
      ...(tool.id === "water-outages" && {
        waterAlerts: shapeWaterAlerts(rows),
      }),
    };
  }

  /**
   * The tool-event rows the shared shapers take, read as the dashboard's
   * Tools tab reads them: each event's `tool` values give every tool's count,
   * and a tool's outcome and action values come through Umami's property
   * filter. One request at a time, for one tool or for all of them.
   */
  private async toolEventRows(
    client: UmamiClient,
    tools: Tool[],
    range: Range,
  ): Promise<ToolEventRows> {
    const { landingWebsiteId } = this.umamiConfig();
    const byTool = (event: string) =>
      client.eventDataValues(landingWebsiteId, event, "tool", range);
    const resultsByTool = await byTool("tool-result");
    const actionsByTool = await byTool("tool-action");
    const errorsByTool = await byTool("tool-error");
    // A breakdown that can't be read is left out, so the shapers show a dash.
    const outcomes = new Map<ToolId, EventDataValue[]>();
    const actions = new Map<ToolId, EventDataValue[]>();
    for (const tool of tools) {
      const o = await this.toolBreakdown(
        client,
        tool,
        "tool-result",
        "outcome",
        totalFor(resultsByTool, tool.id),
        range,
      );
      if (o) outcomes.set(tool.id, o);
      const a = await this.toolBreakdown(
        client,
        tool,
        "tool-action",
        "action",
        totalFor(actionsByTool, tool.id),
        range,
      );
      if (a) actions.set(tool.id, a);
    }
    return { resultsByTool, actionsByTool, errorsByTool, outcomes, actions };
  }

  /**
   * One tool's values of an event property, through Umami's property filter:
   * [] with no request when the tool sent `count` = 0 of the event. Undefined
   * when the request fails, or when the values add up to more than the tool's
   * own count, as they would if Umami ignored the filter (as the dashboard
   * checks).
   */
  private async toolBreakdown(
    client: UmamiClient,
    tool: Tool,
    event: string,
    propertyName: string,
    count: number,
    range: Range,
  ): Promise<EventDataValue[] | undefined> {
    if (!count) return [];
    try {
      const rows = await client.eventDataValues(
        this.umamiConfig().landingWebsiteId,
        event,
        propertyName,
        range,
        { property: "tool", equals: tool.id },
      );
      return rows.reduce((s, r) => s + r.total, 0) <= count ? rows : undefined;
    } catch {
      return undefined;
    }
  }

  /** eventDataValues that degrades to [] when the event has no data. */
  private async eventValues(
    client: UmamiClient,
    websiteId: string,
    event: string,
    propertyName: string,
    range: Range,
  ): Promise<EventDataValue[]> {
    try {
      return await client.eventDataValues(
        websiteId,
        event,
        propertyName,
        range,
      );
    } catch {
      return [];
    }
  }

  /** Post a reply; a plain string is sent as text only. */
  private async post(
    responseUrl: string,
    message: SlackMessage | string,
  ): Promise<void> {
    const url = slackResponseUrl(responseUrl);
    if (!url) {
      this.logger.warn("[slack-stats] refused a non-Slack response_url");
      return;
    }
    await this.send(url, {
      response_type: "ephemeral",
      ...(typeof message === "string" ? { text: message } : message),
    });
  }

  /** POST a JSON payload to Slack. Logs failures and returns whether Slack accepted it; never throws. */
  private async send(url: string, payload: object): Promise<boolean> {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(SLACK_POST_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`[slack-stats] reply rejected: HTTP ${res.status}`);
      }
      return res.ok;
    } catch (err) {
      this.logger.warn(
        `[slack-stats] reply delivery failed: ${sanitizeForLog(
          err instanceof Error ? err.message : String(err),
        )}`,
      );
      return false;
    }
  }

  private umamiConfig(): UmamiConfig {
    return {
      apiKey: this.config.get<string>("UMAMI_API_KEY") ?? "",
      landingWebsiteId:
        this.config.get<string>("UMAMI_LANDING_WEBSITE_ID") ?? "",
      formsWebsiteId: this.config.get<string>("UMAMI_FORMS_WEBSITE_ID") ?? "",
    };
  }
}

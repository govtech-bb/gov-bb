import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  FUNNEL_WINDOW_MIN,
  UmamiClient,
  buildFunnelSteps,
  buildVisitFunnelSteps,
  comparisonPeriods,
  eventName,
  funnelHeadline,
  tallyFieldErrors,
  weightedAverage,
  type EventDataValue,
  type Range,
  type StatsPeriod,
} from "@govtech-bb/umami-analytics";
import { sanitizeForLog } from "@/common/log-sanitize";
import { FormDefinitionsService } from "@/forms/form-definitions/form-definitions.service";
import {
  biggestFinishDrops,
  formatFormStats,
  formatSiteStats,
  periodHeading,
  type FormPeriod,
  type SitePeriod,
  type SlackMessage,
} from "./stats-message";
import { suggestFormIds } from "./stats-command";

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
  private queue: Promise<void> = Promise.resolve();

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
   * isn't held to the slash-command response_url shape. Never throws.
   */
  postWeeklyDigest(webhookUrl: string, now: Date = new Date()): Promise<void> {
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
  private enqueue(job: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(job);
    return this.queue;
  }

  private async reply(
    {
      command,
      period,
      formId,
    }: { command: string; period: StatsPeriod; formId?: string },
    deliver: (message: SlackMessage | string) => Promise<void>,
    now: Date,
  ): Promise<void> {
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
    await deliver(message);
  }

  async buildReply(
    command: string,
    period: StatsPeriod,
    formId: string | undefined,
    now: Date,
  ): Promise<SlackMessage | string> {
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
      const suggestions = suggestFormIds(
        formId,
        forms.map((f) => f.formId),
      );
      return suggestions.length
        ? `🤔 No form with the ID \`${formId}\`. Did you mean ${suggestions
            .map((s) => `\`${s}\``)
            .join(", ")}?`
        : `🤔 No form with the ID \`${formId}\`. Form IDs are the part of the form's address after /forms/.`;
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

  /** POST a JSON payload to Slack. Logs failures; never throws. */
  private async send(url: string, payload: object): Promise<void> {
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
    } catch (err) {
      this.logger.warn(
        `[slack-stats] reply delivery failed: ${sanitizeForLog(
          err instanceof Error ? err.message : String(err),
        )}`,
      );
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

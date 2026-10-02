import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import { FormConfigService } from "@/forms/form-config/form-config.service";
import {
  parseWebhookDestinations,
  type WebhookDestination,
} from "./webhook-destinations.parser";

/** The deploy-time audit result, surfaced on the monitoring/health surface. */
export interface WebhookDestinationsAudit {
  /** JSON parse/validation problems (malformed blob or bad entry). */
  issues: string[];
  /** Ministry keys a form points at (mda_contact) but absent from the JSON. */
  missingMinistries: string[];
  /** Ministry keys present in the JSON. */
  configuredMinistries: string[];
  /** True when there are no issues and no missing ministries. */
  ok: boolean;
}

/**
 * Resolves a form's CMS webhook destination (#1920/#2020).
 *
 * The per-MDA destinations live in a single Secrets Manager secret, injected at
 * container start as the `MDA_WEBHOOK_DESTINATIONS` env var (JSON keyed by
 * ministry). This service parses & validates that JSON **once at boot** (no
 * runtime AWS call) and resolves a destination by walking the existing
 * `form_config → mda_contact.ministry_key` link, then indexing the parsed map.
 *
 * Parse problems are collected (not thrown) so boot isn't downed by a bad blob;
 * they are exposed via {@link getIssues} for the `/health` audit. Resolution
 * returns `null` on any miss — the webhook processor turns that into a
 * fail-loud `WebhookConfigError` (→ SQS retry → DLQ).
 */
@Injectable()
export class WebhookDestinationsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WebhookDestinationsService.name);
  private readonly destinations: Record<string, WebhookDestination>;
  private readonly issues: string[];
  private missingMinistries: string[] = [];

  constructor(private readonly formConfig: FormConfigService) {
    const parsed = parseWebhookDestinations(
      process.env.MDA_WEBHOOK_DESTINATIONS,
    );
    this.destinations = parsed.destinations;
    this.issues = parsed.issues;
  }

  /**
   * Deploy-time audit (non-fatal): logs any JSON parse issue and any ministry a
   * form points at (`mda_contact.ministry_key`) that has no entry in the secret
   * — so a provisioning gap shows at deploy, not at the first (DLQ'd)
   * submission. Never throws: a DB error at boot is logged and skipped rather
   * than downing the API.
   */
  async onApplicationBootstrap(): Promise<void> {
    for (const issue of this.issues) {
      this.logger.error(`[webhook-destinations] ${issue}`);
    }
    try {
      const referenced = await this.formConfig.listConfiguredMinistryKeys();
      const configured = new Set(this.configuredMinistries());
      this.missingMinistries = referenced.filter((k) => !configured.has(k));
      for (const key of this.missingMinistries) {
        this.logger.error(
          `[webhook-destinations] MDA ministry "${key}" has no entry in MDA_WEBHOOK_DESTINATIONS — submissions to its forms will DLQ`,
        );
      }
      if (this.issues.length === 0 && this.missingMinistries.length === 0) {
        this.logger.log(
          `[webhook-destinations] OK — ${configured.size} ministry destination(s) configured`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `[webhook-destinations] audit skipped — could not read mda_contact at boot: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** The audit result for the monitoring/health surface. */
  getAudit(): WebhookDestinationsAudit {
    return {
      issues: [...this.issues],
      missingMinistries: [...this.missingMinistries],
      configuredMinistries: this.configuredMinistries(),
      ok: this.issues.length === 0 && this.missingMinistries.length === 0,
    };
  }

  /** The destination for a ministry key, or `null` if absent/invalid. */
  get(ministryKey: string): WebhookDestination | null {
    return this.destinations[ministryKey] ?? null;
  }

  /** Ministry keys present in the parsed config (for the startup audit). */
  configuredMinistries(): string[] {
    return Object.keys(this.destinations);
  }

  /** Parse/validation problems for the `/health` audit (never secret values). */
  getIssues(): string[] {
    return [...this.issues];
  }

  /**
   * Resolves a form's destination: `formId → ministry key → { url, secret }`.
   * Returns `null` when the form has no ministry key (unmapped MDA) or the key
   * has no valid entry in `MDA_WEBHOOK_DESTINATIONS`.
   */
  async resolveWebhookDestination(
    formId: string,
  ): Promise<WebhookDestination | null> {
    const ministryKey = await this.formConfig.resolveMinistryKey(formId);
    if (!ministryKey) return null;
    return this.get(ministryKey);
  }
}

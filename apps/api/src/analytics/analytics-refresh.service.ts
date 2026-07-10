import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigType } from "@nestjs/config";
import { DataSource } from "typeorm";
import { UmamiClient, buildReportModel } from "@govtech-bb/umami-analytics";
import { AnalyticsReportCacheEntity } from "../database/entities/analytics-report-cache.entity";
import umamiConfig from "../config/umami.config";

/** Distinct from other advisory-lock keys in the codebase (payments = 91337). */
export const ANALYTICS_REFRESH_LOCK_KEY = 91340;
export const ANALYTICS_CACHE_KEY = "latest";

/**
 * Refreshes the cached analytics report on a schedule. Crawling Umami is slow
 * and rate-limited, so it can't run at request time — this @Cron builds the
 * report every 15 minutes and upserts it into `analytics_report_cache`; the
 * public GET /analytics/report just reads that row.
 *
 * The api runs on multiple ECS tasks and the cron fires on each, so a Postgres
 * advisory lock ensures exactly ONE task crawls per cycle (pattern mirrors
 * PaymentReconciliationService). The Umami API key stays in api env.
 */
@Injectable()
export class AnalyticsRefreshService {
  private readonly logger = new Logger(AnalyticsRefreshService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(umamiConfig.KEY)
    private readonly config: ConfigType<typeof umamiConfig>,
  ) {}

  private isConfigured(): boolean {
    return Boolean(
      this.config.apiKey &&
      this.config.landingWebsiteId &&
      this.config.formsWebsiteId,
    );
  }

  @Cron("*/15 * * * *") // every 15 minutes
  async scheduled(): Promise<void> {
    try {
      await this.refresh();
    } catch (err) {
      this.logger.error("Analytics refresh failed", err);
    }
  }

  /** Crawl Umami + upsert the cached report. Returns whether this task did the
   * work (false = another task held the lock, or Umami isn't configured). */
  async refresh(): Promise<{ skipped: boolean }> {
    if (!this.isConfigured()) {
      this.logger.warn(
        "[analytics] UMAMI_* not configured — skipping refresh (report stays empty).",
      );
      return { skipped: true };
    }

    // Advisory locks are session-scoped; pin one QueryRunner so lock + unlock
    // land on the same connection.
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    try {
      const [{ pg_try_advisory_lock: locked }] = await runner.query(
        `SELECT pg_try_advisory_lock($1)`,
        [ANALYTICS_REFRESH_LOCK_KEY],
      );
      if (!locked) return { skipped: true };

      try {
        const client = new UmamiClient({
          apiKey: this.config.apiKey,
          baseUrl: this.config.apiUrl,
        });
        const report = await buildReportModel(client, {
          landingWebsiteId: this.config.landingWebsiteId,
          formsWebsiteId: this.config.formsWebsiteId,
          timezone: this.config.timezone,
          now: new Date(),
          sessionDays: this.config.sessionDays,
          sessionMax: this.config.sessionMax,
        });

        // save() upserts by primary key: first run inserts key='latest', later
        // runs update it.
        await this.dataSource.getRepository(AnalyticsReportCacheEntity).save({
          key: ANALYTICS_CACHE_KEY,
          data: report as unknown as Record<string, unknown>,
          refreshedAt: new Date(),
        });

        this.logger.log(
          `[analytics] refreshed: ${report.presets.length} presets` +
            (report.sessions
              ? `, ${report.sessions.funnels.length} session funnels`
              : ", no session report"),
        );
        return { skipped: false };
      } finally {
        await runner.query(`SELECT pg_advisory_unlock($1)`, [
          ANALYTICS_REFRESH_LOCK_KEY,
        ]);
      }
    } finally {
      await runner.release();
    }
  }
}

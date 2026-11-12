import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import { DataSource } from "typeorm";
import { SlackStatsService } from "./slack-stats.service";

// Session-scoped advisory-lock key so only one API task posts the digest.
const DIGEST_LOCK_KEY = 34911;
// The least time the winner holds the lock, so a task whose clock or DB
// connection is a little late still finds it taken when the post was quick.
const MIN_LOCK_HOLD_MS = 60_000;

/**
 * Posts last week's site-wide stats (the `/stats week` reply) to a Slack
 * channel every Monday at 8am Barbados time (#3491). The channel is whichever
 * incoming webhook SLACK_STATS_WEBHOOK_URL points at; unset ⇒ no digest. Every
 * API task fires the cron, so a Postgres advisory lock lets only one post. The
 * winner holds the lock for the Umami run, and for at least a minute even when
 * Umami fails fast, so the others find it taken and skip.
 */
@Injectable()
export class WeeklyDigestService {
  private readonly logger = new Logger(WeeklyDigestService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly stats: SlackStatsService,
  ) {}

  @Cron("0 8 * * 1", {
    name: "slack-weekly-digest",
    timeZone: "America/Barbados",
  })
  async scheduled(): Promise<void> {
    const webhookUrl = this.config.get<string>("SLACK_STATS_WEBHOOK_URL") ?? "";
    if (!webhookUrl || !this.stats.isConfigured()) return;

    const runner = this.dataSource.createQueryRunner();
    try {
      await runner.connect();
      const [{ pg_try_advisory_lock: locked }] = await runner.query(
        `SELECT pg_try_advisory_lock($1)`,
        [DIGEST_LOCK_KEY],
      );
      if (!locked) return; // another task is posting it.
      try {
        const [posted] = await Promise.all([
          this.stats.postWeeklyDigest(webhookUrl),
          new Promise((resolve) => setTimeout(resolve, MIN_LOCK_HOLD_MS)),
        ]);
        if (posted) this.logger.log("weekly stats digest posted");
        else this.logger.warn("weekly stats digest not posted");
      } finally {
        await runner.query(`SELECT pg_advisory_unlock($1)`, [DIGEST_LOCK_KEY]);
      }
    } catch (err) {
      this.logger.error("weekly stats digest failed", err as Error);
    } finally {
      await runner.release();
    }
  }
}

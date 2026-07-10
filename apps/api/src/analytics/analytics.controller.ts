import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { AnalyticsReportCacheEntity } from "../database/entities/analytics-report-cache.entity";
import { ANALYTICS_CACHE_KEY } from "./analytics-refresh.service";

/**
 * Serves the cached analytics report to the /analytics dashboard. Public + no
 * throttle (like /health) — the payload is aggregate counts only (no PII), and
 * the data is a server-side cache refreshed on a schedule, so a read is a single
 * indexed row fetch. Returns `refreshedAt` so the UI can show data freshness.
 */
@ApiTags("Analytics")
@Controller("analytics")
@SkipThrottle()
export class AnalyticsController {
  constructor(private readonly dataSource: DataSource) {}

  @Get("report")
  @ApiOperation({
    summary: "Cached analytics report",
    description:
      "The latest computed Umami analytics report (event presets + session report). Served from a server-side cache refreshed every 15 minutes.",
  })
  @ApiResponse({
    status: 200,
    description: "The cached report, or a warming-up placeholder.",
  })
  async report(): Promise<{
    ready: boolean;
    refreshedAt: string | null;
    report: Record<string, unknown> | null;
  }> {
    const row = await this.dataSource
      .getRepository(AnalyticsReportCacheEntity)
      .findOne({ where: { key: ANALYTICS_CACHE_KEY } });

    if (!row) {
      // Cold start: the first scheduled refresh hasn't populated the cache yet.
      return { ready: false, refreshedAt: null, report: null };
    }
    return {
      ready: true,
      refreshedAt: row.refreshedAt.toISOString(),
      report: row.data,
    };
  }
}

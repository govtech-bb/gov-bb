import { Column, Entity, PrimaryColumn } from "typeorm";

/**
 * Server-side cache of the computed analytics report. A single row (key
 * `"latest"`) holds the whole ReportModel as JSONB, refreshed on a schedule by
 * the api's AnalyticsRefreshService (crawling Umami is too slow/rate-limited to
 * do at request time). The public GET /analytics/report serves this row so the
 * dashboard reads are instant and the Umami API key never leaves the server.
 */
@Entity({ name: "analytics_report_cache" })
export class AnalyticsReportCacheEntity {
  /** Cache slot; only `"latest"` is used today. */
  @PrimaryColumn({ name: "key", type: "varchar", length: 64 })
  key!: string;

  /** The full ReportModel JSON (presets + session report). */
  @Column({ name: "data", type: "jsonb" })
  data!: Record<string, unknown>;

  /** When this row was last successfully refreshed. */
  @Column({ name: "refreshed_at", type: "timestamptz" })
  refreshedAt!: Date;
}

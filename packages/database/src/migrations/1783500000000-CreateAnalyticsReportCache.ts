import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Server-side cache for the computed analytics report. One row (key='latest')
 * holds the whole ReportModel as JSONB; the api refreshes it on a schedule and
 * serves it from GET /analytics/report. Keeps the Umami crawl off the request
 * path and the API key server-side.
 */
export class CreateAnalyticsReportCache1783500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "analytics_report_cache" (
        "key" varchar(64) NOT NULL,
        "data" jsonb NOT NULL,
        "refreshed_at" timestamptz NOT NULL,
        CONSTRAINT "PK_analytics_report_cache" PRIMARY KEY ("key")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "analytics_report_cache"`);
  }
}

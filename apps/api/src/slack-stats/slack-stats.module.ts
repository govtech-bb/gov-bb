import { Module } from "@nestjs/common";
import { FormDefinitionsModule } from "@/forms/form-definitions/form-definitions.module";
import { SlackStatsController } from "./slack-stats.controller";
import { SlackStatsService } from "./slack-stats.service";
import { WeeklyDigestService } from "./weekly-digest.service";

/** Slack `/stats` slash command and Monday digest over Umami analytics (#3491). */
@Module({
  imports: [FormDefinitionsModule],
  controllers: [SlackStatsController],
  providers: [SlackStatsService, WeeklyDigestService],
})
export class SlackStatsModule {}

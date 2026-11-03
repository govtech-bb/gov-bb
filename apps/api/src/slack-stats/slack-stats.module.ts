import { Module } from "@nestjs/common";
import { FormDefinitionsModule } from "@/forms/form-definitions/form-definitions.module";
import { SlackStatsController } from "./slack-stats.controller";
import { SlackStatsService } from "./slack-stats.service";

/** Slack `/stats` slash command over Umami analytics (#3491). */
@Module({
  imports: [FormDefinitionsModule],
  controllers: [SlackStatsController],
  providers: [SlackStatsService],
})
export class SlackStatsModule {}

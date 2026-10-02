import { Module } from "@nestjs/common";
import { SlackNotifierService } from "./slack-notifier.service";

/**
 * Best-effort operator alerting (#2168). The Slack webhook URL is resolved from
 * env at boot (SLACK_ALERTS_WEBHOOK_URL, injected from Secrets Manager via the
 * ECS task env like other API secrets); an unset value ⇒ the notifier no-ops.
 */
@Module({
  providers: [
    {
      provide: SlackNotifierService,
      useFactory: () =>
        new SlackNotifierService(process.env.SLACK_ALERTS_WEBHOOK_URL ?? ""),
    },
  ],
  exports: [SlackNotifierService],
})
export class NotificationsModule {}

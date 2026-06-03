import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { YouthOpportunityWebhookListener } from "./youth-opportunity-webhook.listener";
import { YouthOpportunityWebhookService } from "./youth-opportunity-webhook.service";

/**
 * Dispatches youth-opportunity submissions to the external case-management
 * webhook. Listens to `submission.created` (emitted by the submissions flow)
 * and forwards the application server-side, replacing the old frontend dispatch.
 */
@Module({
  imports: [HttpModule],
  providers: [YouthOpportunityWebhookService, YouthOpportunityWebhookListener],
})
export class WebhooksModule {}

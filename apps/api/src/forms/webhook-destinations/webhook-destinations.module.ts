import { Module } from "@nestjs/common";
import { FormConfigModule } from "@/forms/form-config/form-config.module";
import { WebhookDestinationsService } from "./webhook-destinations.service";

/**
 * Per-MDA CMS webhook destinations (#1920/#2020). Parses the
 * `MDA_WEBHOOK_DESTINATIONS` JSON secret at boot and resolves a form's
 * destination via the `form_config → mda_contact.ministry_key` link
 * (FormConfigModule).
 */
@Module({
  imports: [FormConfigModule],
  providers: [WebhookDestinationsService],
  exports: [WebhookDestinationsService],
})
export class WebhookDestinationsModule {}

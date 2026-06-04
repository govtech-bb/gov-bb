import { Module } from "@nestjs/common";
import { FormConfigRepository } from "./form-config.repository";
import { MdaContactRepository } from "./mda-contact.repository";
import { FormConfigService } from "./form-config.service";

/**
 * Per-form, per-environment config (`form_config` + `mda_contact`). Exposes a
 * read service used by the email processor to resolve the private MDA
 * notification recipient. The repositories self-construct from the shared
 * DataSource (BaseRepository pattern), so no TypeOrmModule.forFeature is needed.
 */
@Module({
  providers: [FormConfigRepository, MdaContactRepository, FormConfigService],
  exports: [FormConfigService],
})
export class FormConfigModule {}

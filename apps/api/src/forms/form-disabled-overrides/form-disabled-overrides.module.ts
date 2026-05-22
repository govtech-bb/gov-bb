import { Module } from "@nestjs/common";
import { FormDisabledOverrideRepository } from "./form-disabled-override.repository";
import { FormDisabledOverridesService } from "./form-disabled-overrides.service";
import { FormDisabledOverridesAdminController } from "./form-disabled-overrides.admin.controller";

@Module({
  controllers: [FormDisabledOverridesAdminController],
  providers: [FormDisabledOverridesService, FormDisabledOverrideRepository],
  exports: [FormDisabledOverridesService],
})
export class FormDisabledOverridesModule {}

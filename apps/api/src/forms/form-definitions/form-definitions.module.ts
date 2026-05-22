import { Module } from "@nestjs/common";
import { FormDefinitionsController } from "./form-definitions.controller";
import { FormDefinitionsService } from "./form-definitions.service";
import { FormDefinitionRepository } from "./form-definition.repository";
import { FormDisabledOverridesModule } from "../form-disabled-overrides/form-disabled-overrides.module";
import { RegistryModule } from "../../registry/registry.module";

@Module({
  imports: [RegistryModule, FormDisabledOverridesModule],
  controllers: [FormDefinitionsController],
  providers: [FormDefinitionsService, FormDefinitionRepository],
  exports: [FormDefinitionsService],
})
export class FormDefinitionsModule {}

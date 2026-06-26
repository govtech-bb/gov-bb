import { Module } from "@nestjs/common";
import { FormDefinitionsController } from "./form-definitions.controller";
import { FormDefinitionsService } from "./form-definitions.service";
import { FormDefinitionRepository } from "./form-definition.repository";
import { RecipeFileLoaderService } from "./recipe-file-loader.service";
import { DraftArchiveController } from "./draft-archive.controller";
import { DraftArchiveService } from "./draft-archive.service";
import { FormDisabledOverridesModule } from "../form-disabled-overrides/form-disabled-overrides.module";
import { FormConfigModule } from "../form-config/form-config.module";
import { RegistryModule } from "@/registry/registry.module";

@Module({
  imports: [RegistryModule, FormDisabledOverridesModule, FormConfigModule],
  controllers: [FormDefinitionsController, DraftArchiveController],
  providers: [
    FormDefinitionsService,
    FormDefinitionRepository,
    RecipeFileLoaderService,
    DraftArchiveService,
  ],
  exports: [FormDefinitionsService],
})
export class FormDefinitionsModule {}

import { Module } from "@nestjs/common";
import { FormDefinitionsController } from "./form-definitions.controller";
import { FormDefinitionsService } from "./form-definitions.service";
import { FormDefinitionRepository } from "./form-definition.repository";
import { RecipeFileLoaderService } from "./recipe-file-loader.service";
import { RegistryModule } from "../../registry/registry.module";

@Module({
  imports: [RegistryModule],
  controllers: [FormDefinitionsController],
  providers: [
    FormDefinitionsService,
    FormDefinitionRepository,
    RecipeFileLoaderService,
  ],
  exports: [FormDefinitionsService],
})
export class FormDefinitionsModule {}

import { Module } from "@nestjs/common";
import { FormDefinitionsController } from "./form-definitions.controller";
import { FormDefinitionsService } from "./form-definitions.service";
import { FormDefinitionRepository } from "./form-definition.repository";
import { RegistryModule } from "../../registry/registry.module";
import { RecipeFileLoaderModule } from "../recipe-file-loader/recipe-file-loader.module";

@Module({
  imports: [RegistryModule, RecipeFileLoaderModule],
  controllers: [FormDefinitionsController],
  providers: [FormDefinitionsService, FormDefinitionRepository],
  exports: [FormDefinitionsService],
})
export class FormDefinitionsModule {}

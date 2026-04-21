import { Module } from "@nestjs/common";
import { FormDefinitionRepository } from "../form-definitions/form-definition.repository";
import { FormDraftRepository } from "./form-draft.repository";
import { FormDraftsService } from "./form-drafts.service";
import { FormDraftsController } from "./form-drafts.controller";

@Module({
  controllers: [FormDraftsController],
  providers: [FormDraftsService, FormDraftRepository, FormDefinitionRepository],
  exports: [FormDraftsService],
})
export class FormDraftsModule {}

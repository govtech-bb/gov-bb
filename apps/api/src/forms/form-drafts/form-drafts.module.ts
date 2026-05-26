import { Module } from "@nestjs/common";
import { FormDefinitionsModule } from "../form-definitions/form-definitions.module";
import { FormDraftRepository } from "./form-draft.repository";
import { FormDraftsService } from "./form-drafts.service";
import { FormDraftsController } from "./form-drafts.controller";

@Module({
  imports: [FormDefinitionsModule],
  controllers: [FormDraftsController],
  providers: [FormDraftsService, FormDraftRepository],
  exports: [FormDraftsService],
})
export class FormDraftsModule {}

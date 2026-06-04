import { Module } from "@nestjs/common";
import { FormDefinitionsModule } from "./form-definitions/form-definitions.module";
import { SubmissionsModule } from "./submissions/submissions.module";
import { FormDraftsModule } from "./form-drafts/form-drafts.module";
import { FormDisabledOverridesModule } from "./form-disabled-overrides/form-disabled-overrides.module";

@Module({
  imports: [
    FormDefinitionsModule,
    SubmissionsModule,
    FormDraftsModule,
    FormDisabledOverridesModule,
  ],
  exports: [
    FormDefinitionsModule,
    SubmissionsModule,
    FormDraftsModule,
    FormDisabledOverridesModule,
  ],
})
export class FormsModule {}

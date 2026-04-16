import { Module } from '@nestjs/common';
import { FormDefinitionsModule } from './form-definitions/form-definitions.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { FormDraftsModule } from './form-drafts/form-drafts.module';

@Module({
  imports: [FormDefinitionsModule, SubmissionsModule, FormDraftsModule],
  exports: [FormDefinitionsModule, SubmissionsModule, FormDraftsModule],
})
export class FormsModule {}

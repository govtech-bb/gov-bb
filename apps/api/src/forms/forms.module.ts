import { Module } from '@nestjs/common';
import { FormDefinitionsModule } from './form-definitions/form-definitions.module';
import { FormVersionsModule } from './form-versions/form-versions.module';
import { SubmissionsModule } from './submissions/submissions.module';

@Module({
  imports: [FormDefinitionsModule, FormVersionsModule, SubmissionsModule],
  exports: [FormDefinitionsModule, FormVersionsModule, SubmissionsModule],
})
export class FormsModule {}

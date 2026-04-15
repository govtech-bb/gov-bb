import { Module } from "@nestjs/common";
import { FormDefinitionsModule } from "./form-definitions/form-definitions.module";
import { SubmissionsModule } from "./submissions/submissions.module";

@Module({
  imports: [FormDefinitionsModule, SubmissionsModule],
  exports: [FormDefinitionsModule, SubmissionsModule],
})
export class FormsModule {}

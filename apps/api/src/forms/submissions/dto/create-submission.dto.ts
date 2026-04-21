import { IsNotEmpty, IsObject, IsString } from "class-validator";
import type { StepScopedValues } from "../submissions.types";

export class CreateSubmissionDto {
  @IsString()
  @IsNotEmpty()
  formId!: string;

  @IsString()
  @IsNotEmpty()
  formVersion!: string;

  @IsString()
  @IsNotEmpty()
  draftId!: string;

  @IsObject()
  values!: StepScopedValues;
}

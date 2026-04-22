import { IsNotEmpty, IsObject, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import type { StepScopedValues } from "../submissions.types";

export class CreateSubmissionDto {
  @ApiProperty({
    description: "The ID of the form being submitted",
    example: "passport-renewal",
  })
  @IsString()
  @IsNotEmpty()
  formId!: string;

  @ApiProperty({
    description: "The form version the draft was pinned to",
    example: "1.0.0",
  })
  @IsString()
  @IsNotEmpty()
  formVersion!: string;

  @ApiProperty({
    description: "The draft ID being finalised into a submission",
    example: "user-123-passport-draft",
  })
  @IsString()
  @IsNotEmpty()
  draftId!: string;

  @ApiProperty({
    description: "Step-scoped field values keyed by stepId",
    type: "object",
    additionalProperties: true,
    example: { personalDetails: { firstName: "Jane", surname: "Doe" } },
  })
  @IsObject()
  values!: StepScopedValues;
}

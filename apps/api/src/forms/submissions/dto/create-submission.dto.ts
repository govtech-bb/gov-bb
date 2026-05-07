import { IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";
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
    description:
      "The form version to submit against. When a draftId is supplied this must match the draft's pinned version.",
    example: "1.0.0",
  })
  @IsString()
  @IsNotEmpty()
  formVersion!: string;

  @ApiProperty({
    description:
      "Optional draft ID being finalised into a submission. Omit for stateless submissions that don't go through draft state.",
    example: "user-123-passport-draft",
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  draftId?: string;

  @ApiProperty({
    description: "Step-scoped field values keyed by stepId",
    type: "object",
    additionalProperties: true,
    example: { personalDetails: { firstName: "Jane", surname: "Doe" } },
  })
  @IsObject()
  values!: StepScopedValues;
}

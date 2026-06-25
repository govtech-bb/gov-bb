import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { SEMVER_PATTERN } from "@govtech-bb/form-types";
import type { SubmissionValues } from "../submissions.types";

const MAX_INSTANCES_HARD = 500;
const MAX_TOTAL_INSTANCES = 2000;

function describeShapeFailure(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "values must be an object keyed by stepId";
  }
  const obj = value as Record<string, unknown>;

  let totalInstances = 0;
  for (const [stepId, stepVal] of Object.entries(obj)) {
    if (Array.isArray(stepVal)) {
      if (stepVal.length > MAX_INSTANCES_HARD) {
        return `step '${stepId}' exceeds ${MAX_INSTANCES_HARD} instances`;
      }
      totalInstances += stepVal.length;
      for (let i = 0; i < stepVal.length; i++) {
        const inst = stepVal[i];
        if (typeof inst !== "object" || inst === null || Array.isArray(inst)) {
          return `step '${stepId}' instance ${i} must be an object`;
        }
      }
    } else if (typeof stepVal !== "object" || stepVal === null) {
      return `step '${stepId}' must be an object or array`;
    } else {
      totalInstances += 1;
    }
  }
  if (totalInstances > MAX_TOTAL_INSTANCES) {
    return `total instances across all steps exceeds ${MAX_TOTAL_INSTANCES}`;
  }

  return null;
}

// class-validator caches one instance of this constraint and reuses it
// across concurrent requests, so any field on `this` would leak between
// requests. `validate` and `defaultMessage` both call the pure
// `describeShapeFailure` instead.
@ValidatorConstraint({ name: "submissionValuesShape", async: false })
class SubmissionValuesShape implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return describeShapeFailure(value) === null;
  }
  defaultMessage(args?: { value?: unknown }): string {
    return describeShapeFailure(args?.value) ?? "Invalid submission values";
  }
}

export class CreateSubmissionDto {
  @ApiProperty({ description: "Form ID", example: "passport-renewal" })
  @IsString()
  @IsNotEmpty()
  formId!: string;

  // Version is retired (#1196): new clients omit it and the recipe resolves to
  // the canonical file. Accepted but optional so an old client still sending a
  // (well-formed) version hits the legacy fallback during the cutover.
  @ApiProperty({ description: "Form version (deprecated)", required: false })
  @IsOptional()
  @IsString()
  @Matches(SEMVER_PATTERN)
  formVersion?: string;

  @ApiProperty({ description: "Optional draft ID", required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  draftId?: string;

  @ApiProperty({
    description: "Step-scoped field values; repeatable steps are arrays",
    type: "object",
    additionalProperties: true,
    example: {
      personal: { firstName: "Jane" },
      jobs: [{ employer: "ACME" }],
    },
  })
  @IsObject()
  @Validate(SubmissionValuesShape)
  values!: SubmissionValues;
}

import {
  IsOptional,
  IsString,
  MaxLength,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

// Generous upper bound on each free-text field. Long enough for genuine
// feedback, short enough to keep a hostile payload from bloating the email.
const MAX_FIELD_LENGTH = 5000;

// At least one of the two free-text fields must carry content — mirrors the
// landing-side Zod refine so the API rejects an all-blank submission the same
// way the browser does, rather than emailing an empty message.
@ValidatorConstraint({ name: "feedbackNotEmpty", async: false })
class FeedbackNotEmpty implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CreateFeedbackDto;
    return Boolean(dto.visitReason?.trim() || dto.whatWentWrong?.trim());
  }
  defaultMessage(): string {
    return "At least one feedback field is required";
  }
}

export class CreateFeedbackDto {
  @ApiProperty({
    description: "Why the visitor came to the site",
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_FIELD_LENGTH)
  visitReason?: string;

  @ApiProperty({ description: "What went wrong", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_FIELD_LENGTH)
  whatWentWrong?: string;

  @ApiProperty({
    description: "Page the visitor was on when they opened the form",
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_FIELD_LENGTH)
  referrer?: string;

  // Carries the cross-field "at least one field" rule. It lives on an
  // always-present property (default `true`) rather than on `visitReason`,
  // because @IsOptional on a text field short-circuits every validator on that
  // field when it is absent — which would let an all-blank payload through. The
  // validator ignores this property's value and inspects the text fields, so a
  // client-sent value (allowed by the whitelist) has no effect. Excluded from
  // the Swagger surface.
  @Validate(FeedbackNotEmpty)
  readonly present: boolean = true;
}

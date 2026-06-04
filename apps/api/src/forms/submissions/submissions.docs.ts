import { applyDecorators } from "@nestjs/common";
import { ApiBody, ApiHeader, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiWrappedResponse } from "../../common/swagger";
import { CreateSubmissionDto, FormSubmissionResponseDto } from "./dto";

export function CreateSubmissionDocs() {
  return applyDecorators(
    ApiOperation({
      summary: "Submit a form",
      description:
        "Finalises a draft into a form submission. The `Idempotency-Key` header ensures " +
        "duplicate requests are safely detected — repeat calls with the same key return " +
        "the original submission without creating a new one.",
    }),
    ApiHeader({
      name: "idempotency-key",
      description:
        "Client-generated unique key to deduplicate concurrent or retried requests",
      example: "req-abc-123",
      required: true,
    }),
    ApiBody({ type: CreateSubmissionDto }),
    ApiWrappedResponse({
      status: 201,
      type: FormSubmissionResponseDto,
      description: "Submission created",
    }),
    ApiResponse({
      status: 200,
      description: "Duplicate — submission already exists",
    }),
    ApiResponse({
      status: 202,
      description: "Submission is currently being processed",
    }),
    ApiResponse({
      status: 400,
      description: "Idempotency-Key header missing or request body invalid",
    }),
    ApiResponse({
      status: 429,
      description: "Too many requests — rate limit exceeded",
    }),
  );
}

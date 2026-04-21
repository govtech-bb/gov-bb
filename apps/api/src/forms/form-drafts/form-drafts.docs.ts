import { applyDecorators } from "@nestjs/common";
import {
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
} from "@nestjs/swagger";
import { FormDraftEntity } from "../../database/entities/form-draft.entity";
import { ApiWrappedResponse } from "../../common/swagger";

const draftIdParam = ApiParam({
  name: "draftId",
  description: "The client-supplied draft identifier",
  example: "user-123-passport-draft",
});

export function CreateDraftDocs() {
  return applyDecorators(
    ApiOperation({
      summary: "Create a form draft",
      description:
        "Creates a new draft for the given form, pinning the form version at creation time. " +
        "If a draft with the same draftId already exists, the existing draft is returned (idempotent).",
    }),
    ApiWrappedResponse({ status: 201, type: FormDraftEntity, description: "Draft created (or existing draft returned)" }),
    ApiNotFoundResponse({ description: "Form definition not found" }),
  );
}

export function GetDraftDocs() {
  return applyDecorators(
    ApiOperation({ summary: "Get a draft by ID" }),
    draftIdParam,
    ApiWrappedResponse({ status: 200, type: FormDraftEntity, description: "Draft retrieved" }),
    ApiNotFoundResponse({ description: "Draft not found" }),
  );
}

export function UpdateDraftDocs() {
  return applyDecorators(
    ApiOperation({
      summary: "Update a draft",
      description:
        "Merges the supplied values into the existing draft values. " +
        "Existing fields not included in the payload are preserved.",
    }),
    draftIdParam,
    ApiWrappedResponse({ status: 200, type: FormDraftEntity, description: "Draft updated" }),
    ApiNotFoundResponse({ description: "Draft not found" }),
  );
}

export function AbandonDraftDocs() {
  return applyDecorators(
    ApiOperation({
      summary: "Abandon a draft",
      description: "Marks the draft as abandoned. Abandoned drafts are purged after 7 days.",
    }),
    draftIdParam,
    ApiNoContentResponse({ description: "Draft abandoned" }),
    ApiNotFoundResponse({ description: "Draft not found" }),
  );
}

import { applyDecorators } from "@nestjs/common";
import {
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from "@nestjs/swagger";

export function GetFormDefinitionDocs() {
  return applyDecorators(
    ApiOperation({
      summary: "Get a form definition",
      description: "Returns the hydrated form definition for the given formId.",
    }),
    ApiParam({
      name: "formId",
      description: "The unique form identifier",
      example: "passport-renewal",
    }),
    ApiResponse({
      status: 200,
      description: "Form definition retrieved",
      schema: {
        properties: {
          status: { type: "string", enum: ["success"] },
          message: { type: "string", example: "Form definition retrieved" },
          statusCode: { type: "number", example: 200 },
          data: {
            type: "object",
            description:
              "Hydrated ServiceContract containing steps, processors, and metadata",
          },
        },
      },
    }),
    ApiNotFoundResponse({ description: "Form definition not found" }),
  );
}

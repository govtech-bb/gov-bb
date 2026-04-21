import { Controller, Get, Param, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { FormDefinitionsService } from "./form-definitions.service";
import { ApiResponse as AppApiResponse } from "../../common/response";
import type { ApiResponseShape } from "../../common/response";
import type { ServiceContract } from "@govtech-bb/form-types";

@ApiTags("Form Definitions")
@ApiBearerAuth()
@Controller("form-definitions")
export class FormDefinitionsController {
  constructor(
    private readonly formDefinitionsService: FormDefinitionsService,
  ) {}

  @Get(":formId")
  @ApiOperation({
    summary: "Get a form definition",
    description:
      "Returns the hydrated form definition for the given formId. " +
      "Defaults to the latest version when no version is specified.",
  })
  @ApiParam({ name: "formId", description: "The unique form identifier", example: "passport-renewal" })
  @ApiQuery({ name: "version", required: false, description: "Specific form version to retrieve", example: "1.0.0" })
  @ApiResponse({
    status: 200,
    description: "Form definition retrieved",
    schema: {
      properties: {
        status: { type: "string", enum: ["success"] },
        message: { type: "string", example: "Form definition retrieved" },
        statusCode: { type: "number", example: 200 },
        data: {
          type: "object",
          description: "Hydrated ServiceContract containing steps, processors, and metadata",
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: "Form definition not found" })
  async get(
    @Param("formId") formId: string,
    @Query("version") version?: string,
  ): Promise<ApiResponseShape<ServiceContract>> {
    const data = await this.formDefinitionsService.findByFormId({ formId, version });
    return AppApiResponse.success(data, { message: "Form definition retrieved" });
  }
}

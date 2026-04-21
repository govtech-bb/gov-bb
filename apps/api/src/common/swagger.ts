import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

/**
 * Generates a typed `ApiResponseShape<T>` schema for Swagger responses.
 *
 * Usage:
 *   @ApiWrappedResponse({ status: 201, type: FormDraftEntity })
 */
export function ApiWrappedResponse<T extends Type<unknown>>({
  status = 200,
  type,
  description = '',
  isArray = false,
}: {
  status?: number;
  type: T;
  description?: string;
  isArray?: boolean;
}) {
  const dataSchema = isArray
    ? { type: 'array', items: { $ref: getSchemaPath(type) } }
    : { $ref: getSchemaPath(type) };

  return applyDecorators(
    ApiExtraModels(type),
    ApiResponse({
      status,
      description,
      schema: {
        properties: {
          status: { type: 'string', enum: ['success', 'failed'] },
          message: { type: 'string' },
          statusCode: { type: 'number', example: status },
          data: dataSchema,
        },
      },
    }),
  );
}

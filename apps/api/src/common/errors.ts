import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";

export class AppError {
  static notFound(
    resource: string,
    identifier?: string | Record<string, string | undefined>,
  ): NotFoundException {
    const detail = identifier
      ? typeof identifier === "string"
        ? `${resource} not found: ${identifier}`
        : `${resource} not found: ${Object.entries(identifier)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")}`
      : `${resource} not found`;
    return new NotFoundException(detail);
  }

  static badRequest(detail: string): BadRequestException {
    return new BadRequestException(detail);
  }

  static conflict(resource: string, identifier?: string): ConflictException {
    const detail = identifier
      ? `${resource} already exists: ${identifier}`
      : `${resource} already exists`;
    return new ConflictException(detail);
  }

  static unauthorized(): UnauthorizedException {
    return new UnauthorizedException("Unauthorized");
  }

  static forbidden(): ForbiddenException {
    return new ForbiddenException("Forbidden");
  }

  static unprocessable(
    errors: Record<string, string[]>,
  ): UnprocessableEntityException {
    return new UnprocessableEntityException({ errors });
  }

  static internal(detail?: string): InternalServerErrorException {
    return new InternalServerErrorException(
      detail ?? "An unexpected error occurred",
    );
  }
}

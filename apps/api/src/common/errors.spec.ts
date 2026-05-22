import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { AppError } from "./errors";

describe("AppError", () => {
  describe("notFound", () => {
    it("returns NotFoundException with generic message when no identifier given", () => {
      const err = AppError.notFound("Widget");
      expect(err).toBeInstanceOf(NotFoundException);
      const msg = (err.getResponse() as { message: string }).message;
      expect(msg).toContain("Widget not found");
    });

    it("returns NotFoundException with string identifier", () => {
      const err = AppError.notFound("Draft", "draft-abc");
      expect(err).toBeInstanceOf(NotFoundException);
      const msg = (err.getResponse() as { message: string }).message;
      expect(msg).toContain("draft-abc");
    });

    it("returns NotFoundException with record identifier (all values defined)", () => {
      const err = AppError.notFound("Form definition", {
        formId: "passport-renewal",
        version: "1.0.0",
      });
      expect(err).toBeInstanceOf(NotFoundException);
      const msg = (err.getResponse() as { message: string }).message;
      expect(msg).toContain("formId=passport-renewal");
      expect(msg).toContain("version=1.0.0");
    });

    it("filters out undefined values in record identifier", () => {
      const err = AppError.notFound("Form definition", {
        formId: "passport-renewal",
        version: undefined,
      });
      expect(err).toBeInstanceOf(NotFoundException);
      const msg = (err.getResponse() as { message: string }).message;
      expect(msg).toContain("formId=passport-renewal");
      expect(msg).not.toContain("version");
    });
  });

  describe("badRequest", () => {
    it("returns BadRequestException with string detail", () => {
      const err = AppError.badRequest("Invalid input");
      expect(err).toBeInstanceOf(BadRequestException);
      const msg = (err.getResponse() as { message: string }).message;
      expect(msg).toContain("Invalid input");
    });

    it("returns BadRequestException with record detail", () => {
      const err = AppError.badRequest({ message: "Bad payload", errors: {} });
      expect(err).toBeInstanceOf(BadRequestException);
    });
  });

  describe("conflict", () => {
    it("returns ConflictException with generic message when no identifier given", () => {
      const err = AppError.conflict("FormDefinition");
      expect(err).toBeInstanceOf(ConflictException);
      const msg = (err.getResponse() as { message: string }).message;
      expect(msg).toContain("FormDefinition already exists");
    });

    it("returns ConflictException with identifier", () => {
      const err = AppError.conflict("FormDefinition", "passport-renewal");
      expect(err).toBeInstanceOf(ConflictException);
      const msg = (err.getResponse() as { message: string }).message;
      expect(msg).toContain("passport-renewal");
    });
  });

  describe("unauthorized", () => {
    it("returns UnauthorizedException", () => {
      const err = AppError.unauthorized();
      expect(err).toBeInstanceOf(UnauthorizedException);
      const msg = (err.getResponse() as { message: string }).message;
      expect(msg).toContain("Unauthorized");
    });
  });

  describe("forbidden", () => {
    it("returns ForbiddenException", () => {
      const err = AppError.forbidden();
      expect(err).toBeInstanceOf(ForbiddenException);
      const msg = (err.getResponse() as { message: string }).message;
      expect(msg).toContain("Forbidden");
    });
  });

  describe("unprocessable", () => {
    it("returns UnprocessableEntityException with errors object", () => {
      const err = AppError.unprocessable({ fieldA: ["required"] });
      expect(err).toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe("internal", () => {
    it("returns InternalServerErrorException with default message when no detail given", () => {
      const err = AppError.internal();
      expect(err).toBeInstanceOf(InternalServerErrorException);
      const msg = (err.getResponse() as { message: string }).message;
      expect(msg).toContain("unexpected error");
    });

    it("returns InternalServerErrorException with custom detail", () => {
      const err = AppError.internal("Database connection failed");
      expect(err).toBeInstanceOf(InternalServerErrorException);
      const msg = (err.getResponse() as { message: string }).message;
      expect(msg).toContain("Database connection failed");
    });
  });
});

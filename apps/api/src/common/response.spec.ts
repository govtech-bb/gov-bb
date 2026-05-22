import { HttpStatus } from "@nestjs/common";
import { ApiResponse } from "./response";

describe("ApiResponse", () => {
  describe("success()", () => {
    it("returns status=success with defaults when no options provided", () => {
      const result = ApiResponse.success({ id: 1 });
      expect(result.status).toBe("success");
      expect(result.message).toBe("Success");
      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data).toEqual({ id: 1 });
      expect(result.meta).toBeUndefined();
    });

    it("includes meta when provided", () => {
      const result = ApiResponse.success({ id: 1 }, { meta: { page: 1 } });
      expect(result.meta).toEqual({ page: 1 });
    });

    it("omits meta when not provided (branch: !meta)", () => {
      const result = ApiResponse.success({ id: 1 }, {});
      expect("meta" in result).toBe(false);
    });

    it("uses provided message and statusCode", () => {
      const result = ApiResponse.success(null, {
        message: "Created",
        statusCode: HttpStatus.CREATED,
      });
      expect(result.message).toBe("Created");
      expect(result.statusCode).toBe(HttpStatus.CREATED);
    });
  });

  describe("failed()", () => {
    it("returns status=failed with defaults when no options provided", () => {
      const result = ApiResponse.failed();
      expect(result.status).toBe("failed");
      expect(result.message).toBe("An error occurred");
      expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(result.data).toBeNull();
      expect(result.meta).toBeUndefined();
    });

    it("includes meta when provided", () => {
      const result = ApiResponse.failed({ meta: { reason: "timeout" } });
      expect(result.meta).toEqual({ reason: "timeout" });
    });

    it("omits meta when not provided (branch: !meta)", () => {
      const result = ApiResponse.failed({});
      expect("meta" in result).toBe(false);
    });

    it("uses provided message and statusCode", () => {
      const result = ApiResponse.failed({
        message: "Not found",
        statusCode: HttpStatus.NOT_FOUND,
      });
      expect(result.message).toBe("Not found");
      expect(result.statusCode).toBe(HttpStatus.NOT_FOUND);
    });
  });
});

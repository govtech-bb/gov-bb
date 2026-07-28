import type { Mock } from "vitest";
type AnyFn = (...args: any[]) => any;

const { mockApiResponse, mockApiExtraModels, mockGetSchemaPath } = vi.hoisted(
  () => ({
    mockApiResponse: vi.fn(() => vi.fn()) as AnyFn,
    mockApiExtraModels: vi.fn(() => vi.fn()) as AnyFn,
    mockGetSchemaPath: vi.fn(
      (t: { name?: string }) => `#/ref/${t.name ?? "Unknown"}`,
    ) as AnyFn,
  }),
);

vi.mock("@nestjs/common", () => ({
  applyDecorators: (...args: unknown[]) => args,
}));

vi.mock("@nestjs/swagger", () => ({
  ApiExtraModels: mockApiExtraModels,
  ApiResponse: mockApiResponse,
  getSchemaPath: mockGetSchemaPath,
}));

import { ApiWrappedResponse } from "./swagger";

class DummyModel {}

describe("ApiWrappedResponse", () => {
  beforeEach(() => {
    (mockApiResponse as Mock).mockClear();
    (mockApiExtraModels as Mock).mockClear();
  });

  it("uses a $ref schema for a single item when isArray is false (default)", () => {
    ApiWrappedResponse({ type: DummyModel });
    const calls = (mockApiResponse as Mock).mock.calls;
    const callArg: any = calls[0]?.[0];
    expect(callArg.schema.properties.data).toEqual({
      $ref: "#/ref/DummyModel",
    });
  });

  it("uses an array schema when isArray is true", () => {
    ApiWrappedResponse({ type: DummyModel, isArray: true });
    const calls = (mockApiResponse as Mock).mock.calls;
    const callArg: any = calls[0]?.[0];
    expect(callArg.schema.properties.data).toEqual({
      type: "array",
      items: { $ref: "#/ref/DummyModel" },
    });
  });

  it("uses the provided status code", () => {
    ApiWrappedResponse({ type: DummyModel, status: 201 });
    const calls = (mockApiResponse as Mock).mock.calls;
    const callArg: any = calls[0]?.[0];
    expect(callArg.status).toBe(201);
  });

  it("uses the provided description", () => {
    ApiWrappedResponse({ type: DummyModel, description: "Returns a model" });
    const calls = (mockApiResponse as Mock).mock.calls;
    const callArg: any = calls[0]?.[0];
    expect(callArg.description).toBe("Returns a model");
  });
});

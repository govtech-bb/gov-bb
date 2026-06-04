// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

const mockApiResponse: AnyFn = jest.fn(() => jest.fn());
const mockApiExtraModels: AnyFn = jest.fn(() => jest.fn());
const mockGetSchemaPath: AnyFn = jest.fn(
  (t: { name?: string }) => `#/ref/${t.name ?? "Unknown"}`,
);

jest.mock("@nestjs/common", () => ({
  applyDecorators: (...args: unknown[]) => args,
}));

jest.mock("@nestjs/swagger", () => ({
  ApiExtraModels: mockApiExtraModels,
  ApiResponse: mockApiResponse,
  getSchemaPath: mockGetSchemaPath,
}));

import { ApiWrappedResponse } from "./swagger";

class DummyModel {}

describe("ApiWrappedResponse", () => {
  beforeEach(() => {
    (mockApiResponse as jest.Mock).mockClear();
    (mockApiExtraModels as jest.Mock).mockClear();
  });

  it("uses a $ref schema for a single item when isArray is false (default)", () => {
    ApiWrappedResponse({ type: DummyModel });
    const calls = (mockApiResponse as jest.Mock).mock.calls;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callArg: any = calls[0]?.[0];
    expect(callArg.schema.properties.data).toEqual({
      $ref: "#/ref/DummyModel",
    });
  });

  it("uses an array schema when isArray is true", () => {
    ApiWrappedResponse({ type: DummyModel, isArray: true });
    const calls = (mockApiResponse as jest.Mock).mock.calls;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callArg: any = calls[0]?.[0];
    expect(callArg.schema.properties.data).toEqual({
      type: "array",
      items: { $ref: "#/ref/DummyModel" },
    });
  });

  it("uses the provided status code", () => {
    ApiWrappedResponse({ type: DummyModel, status: 201 });
    const calls = (mockApiResponse as jest.Mock).mock.calls;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callArg: any = calls[0]?.[0];
    expect(callArg.status).toBe(201);
  });

  it("uses the provided description", () => {
    ApiWrappedResponse({ type: DummyModel, description: "Returns a model" });
    const calls = (mockApiResponse as jest.Mock).mock.calls;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callArg: any = calls[0]?.[0];
    expect(callArg.description).toBe("Returns a model");
  });
});

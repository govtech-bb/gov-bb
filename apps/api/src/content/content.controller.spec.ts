import {
  ContentController,
  includeNonPublicFromAuth,
} from "./content.controller";

describe("includeNonPublicFromAuth", () => {
  const OLD = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD };
  });

  it("dev passthrough: no token configured, non-prod → true", () => {
    delete process.env.SERVICE_STATUS_ADMIN_TOKEN;
    delete process.env.ARCHIVE_DRAFTS_TOKEN;
    process.env.NODE_ENV = "development";
    expect(includeNonPublicFromAuth(undefined)).toBe(true);
  });

  it("token configured + matching bearer → true", () => {
    process.env.SERVICE_STATUS_ADMIN_TOKEN = "s3cret";
    process.env.NODE_ENV = "production";
    expect(includeNonPublicFromAuth("Bearer s3cret")).toBe(true);
  });

  it("token configured + wrong/absent bearer → false", () => {
    process.env.SERVICE_STATUS_ADMIN_TOKEN = "s3cret";
    process.env.NODE_ENV = "production";
    expect(includeNonPublicFromAuth("Bearer nope")).toBe(false);
    expect(includeNonPublicFromAuth(undefined)).toBe(false);
  });

  it("no token configured in production (misconfigured) → false", () => {
    delete process.env.SERVICE_STATUS_ADMIN_TOKEN;
    delete process.env.ARCHIVE_DRAFTS_TOKEN;
    process.env.NODE_ENV = "production";
    expect(includeNonPublicFromAuth("Bearer anything")).toBe(false);
  });
});

describe("ContentController", () => {
  it("passes the auth-derived flag to the service and wraps the response", () => {
    const mockService = { list: vi.fn().mockReturnValue([{ slug: "a" }]) };
    const controller = new ContentController(mockService as never);
    process.env.NODE_ENV = "development";
    delete process.env.SERVICE_STATUS_ADMIN_TOKEN;
    delete process.env.ARCHIVE_DRAFTS_TOKEN;

    const result = controller.list(undefined);

    expect(mockService.list).toHaveBeenCalledWith(true); // dev passthrough
    expect(result).toMatchObject({ status: "success", data: [{ slug: "a" }] });
  });
});

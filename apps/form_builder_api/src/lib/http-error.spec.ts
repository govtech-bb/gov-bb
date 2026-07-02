import { describe, it, expect } from "vitest";
import { z, type ZodError } from "zod";
import { HttpError, badRequest, notFound, formatZodError } from "./http-error";

describe("HttpError", () => {
  it("is an Error carrying an explicit status and message", () => {
    const err = new HttpError(409, "conflict");
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(409);
    expect(err.message).toBe("conflict");
  });

  it("badRequest is a 400 HttpError", () => {
    const err = badRequest("bad input");
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(400);
    expect(err.message).toBe("bad input");
  });

  it("notFound is a 404 HttpError", () => {
    const err = notFound("nope");
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(404);
    expect(err.message).toBe("nope");
  });
});

describe("formatZodError", () => {
  it("renders each issue as 'path: message', joined by '; '", () => {
    const schema = z.object({ email: z.string().email(), age: z.number() });
    const result = schema.safeParse({ email: "not-an-email", age: "x" });
    expect(result.success).toBe(false);

    const msg = formatZodError((result as { error: ZodError }).error);
    expect(msg).toContain("email: ");
    expect(msg).toContain("age: ");
    expect(msg).toContain("; ");
  });

  it("uses the fallback label for an issue with an empty path", () => {
    const schema = z.object({ a: z.string() });
    const result = schema.safeParse("not-an-object");
    expect(result.success).toBe(false);

    const msg = formatZodError((result as { error: ZodError }).error, "body");
    expect(msg.startsWith("body: ")).toBe(true);
  });
});

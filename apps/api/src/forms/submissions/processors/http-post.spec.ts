import { of } from "rxjs";
import type { HttpService } from "@nestjs/axios";
import { HttpPostError, idempotencyKey, timedPost } from "./http-post";

function mockHttp(status: number): HttpService {
  return {
    request: vi.fn(() => of({ status, data: {} })),
  } as unknown as HttpService;
}

function mockHttpWithBody(status: number, data: unknown): HttpService {
  return {
    request: vi.fn(() => of({ status, data })),
  } as unknown as HttpService;
}

function calls(http: HttpService): unknown[][] {
  return (http.request as unknown as { mock: { calls: unknown[][] } }).mock
    .calls;
}

describe("idempotencyKey", () => {
  it("keys by submissionId and processor index", () => {
    expect(idempotencyKey("sub-1", 0)).toBe("sub-1:0");
    expect(idempotencyKey("sub-1", 2)).toBe("sub-1:2");
  });
});

describe("timedPost", () => {
  it("POSTs the body with headers and the per-call timeout by default", async () => {
    const http = mockHttp(200);

    await timedPost(http, "https://x.example/hook", "the-body", {
      headers: { "X-Idempotency-Key": "sub-1:0" },
      timeoutMs: 7_000,
    });

    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: "https://x.example/hook",
        data: "the-body",
        headers: { "X-Idempotency-Key": "sub-1:0" },
        timeout: 7_000,
      }),
    );
  });

  it("uses the caller-supplied method when given", async () => {
    const http = mockHttp(200);

    await timedPost(http, "https://x.example/hook", "b", {
      headers: {},
      timeoutMs: 1_000,
      method: "PUT",
    });

    expect((calls(http)[0][0] as { method: string }).method).toBe("PUT");
  });

  it("overrides validateStatus so axios never throws before we map the status", async () => {
    const http = mockHttp(200);

    await timedPost(http, "https://x.example/hook", "b", {
      headers: {},
      timeoutMs: 1_000,
    });

    const config = calls(http)[0][0] as { validateStatus: () => boolean };
    expect(config.validateStatus()).toBe(true);
  });

  it("resolves on a 2xx response", async () => {
    const http = mockHttp(204);
    await expect(
      timedPost(http, "https://x.example/hook", "b", {
        headers: {},
        timeoutMs: 1_000,
      }),
    ).resolves.toBeUndefined();
  });

  it("throws HttpPostError carrying the status on a non-2xx response", async () => {
    const http = mockHttp(503);
    await expect(
      timedPost(http, "https://x.example/hook", "b", {
        headers: {},
        timeoutMs: 1_000,
      }),
    ).rejects.toMatchObject({ status: 503, url: "https://x.example/hook" });
  });

  it("carries a sanitized slice of the response body on non-2xx (#2127)", async () => {
    const http = mockHttpWithBody(422, {
      message: "programme_code 'TEMP-RESTAURANT-LICENCE' is not recognised",
    });
    await expect(
      timedPost(http, "https://x.example/hook", "b", {
        headers: {},
        timeoutMs: 1_000,
      }),
    ).rejects.toMatchObject({
      status: 422,
      responseBody: expect.stringContaining("not recognised"),
    });
  });

  it("includes the response body in the HttpPostError message (#2127)", async () => {
    const http = mockHttpWithBody(422, "validation failed: phone");
    await timedPost(http, "https://x.example/hook", "b", {
      headers: {},
      timeoutMs: 1_000,
    }).catch((err: HttpPostError) => {
      expect(err.message).toContain("HTTP 422");
      expect(err.message).toContain("validation failed: phone");
    });
    expect.assertions(2);
  });

  it("omits responseBody for an empty object body", async () => {
    const http = mockHttpWithBody(500, {});
    await expect(
      timedPost(http, "https://x.example/hook", "b", {
        headers: {},
        timeoutMs: 1_000,
      }),
    ).rejects.toMatchObject({ status: 500, responseBody: undefined });
  });

  it("strips control characters from the response body (CWE-117)", async () => {
    const http = mockHttpWithBody(400, "bad\ninput\r\n[forged] line");
    await timedPost(http, "https://x.example/hook", "b", {
      headers: {},
      timeoutMs: 1_000,
    }).catch((err: HttpPostError) => {
      expect(err.responseBody).not.toMatch(/[\n\r]/);
    });
    expect.assertions(1);
  });

  it("HttpPostError message includes the HTTP status", () => {
    expect(new HttpPostError("https://x.example/hook", 502).message).toContain(
      "HTTP 502",
    );
  });
});

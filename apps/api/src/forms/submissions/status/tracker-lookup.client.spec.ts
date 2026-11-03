import type { Mock } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { TrackerLookupClient } from "./tracker-lookup.client";

const REMOTE = "https://abc123.execute-api.ca-central-1.amazonaws.com";
const LOCAL = "http://localhost:4000";

function makeClient(base: string) {
  const config = {
    get: vi.fn().mockReturnValue(base),
  } as unknown as ConfigService;
  return new TrackerLookupClient(config);
}

function answer(body: unknown, status = 200) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

function sentRequest(fetchSpy: Mock) {
  const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
  return { url, headers: new Headers(init.headers) };
}

describe("TrackerLookupClient (#3419)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("reads a found answer, keeping only the status and when it changed", async () => {
    answer({
      found: true,
      reference: "MOH-TRL-2610-47E4AD6",
      mda: "MOH",
      status: "in_progress",
      occurredAt: "2026-10-21T18:28:00Z",
    });

    await expect(
      makeClient(LOCAL).lookup("MOH-TRL-2610-47E4AD6"),
    ).resolves.toEqual({
      found: true,
      status: "in_progress",
      occurredAt: "2026-10-21T18:28:00Z",
    });
  });

  it("reads a not-found answer", async () => {
    answer({ found: false });
    await expect(makeClient(LOCAL).lookup("X")).resolves.toEqual({
      found: false,
    });
  });

  it("calls GET /status/{reference}, the route API Gateway serves", async () => {
    const fetchSpy = answer({ found: false });
    await makeClient(`${LOCAL}/`).lookup("MOH-TRL-2610-47E4AD6");
    expect(sentRequest(fetchSpy as unknown as Mock).url).toBe(
      "http://localhost:4000/status/MOH-TRL-2610-47E4AD6",
    );
  });

  // The local lookup server has no authoriser, and a laptop has no task role.
  it("doesn't sign a request to a local address", async () => {
    const fetchSpy = answer({ found: false });
    await makeClient(LOCAL).lookup("X");
    expect(
      sentRequest(fetchSpy as unknown as Mock).headers.has("authorization"),
    ).toBe(false);
  });

  it("SigV4-signs a request to API Gateway, for execute-api in the API's region", async () => {
    vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIDEXAMPLE");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "secret");
    vi.stubEnv("AWS_SESSION_TOKEN", "session-token");
    const fetchSpy = answer({ found: false });

    await makeClient(REMOTE).lookup("MOH-TRL-2610-47E4AD6");

    const { headers } = sentRequest(fetchSpy as unknown as Mock);
    expect(headers.get("authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/ca-central-1\/execute-api\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date;x-amz-security-token, Signature=[0-9a-f]{64}$/,
    );
    expect(headers.get("x-amz-date")).toMatch(/^\d{8}T\d{6}Z$/);
    expect(headers.get("x-amz-security-token")).toBe("session-token");
  });

  describe("fails rather than guessing", () => {
    it("when no tracker is configured", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      await expect(makeClient("").lookup("X")).rejects.toThrow(
        "not_configured",
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("when a remote address doesn't say which region to sign for", async () => {
      await expect(
        makeClient("https://tracker.example.com").lookup("X"),
      ).rejects.toThrow("unknown_region");
    });

    it("on a non-2xx answer, such as an unsigned or ungranted request", async () => {
      answer({ message: "Forbidden" }, 403);
      await expect(makeClient(LOCAL).lookup("X")).rejects.toThrow("http_403");
    });

    it("on a body that doesn't match the tracker's contract", async () => {
      answer({ found: true, status: "in_progress" });
      await expect(makeClient(LOCAL).lookup("X")).rejects.toThrow("unreadable");
    });

    it("on a body that isn't JSON", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("<html>", { status: 200 }),
      );
      await expect(makeClient(LOCAL).lookup("X")).rejects.toThrow("unreadable");
    });

    it("when the tracker doesn't answer in time", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(
        new DOMException("The operation timed out.", "TimeoutError"),
      );
      await expect(makeClient(LOCAL).lookup("X")).rejects.toThrow("timeout");
    });
  });
});

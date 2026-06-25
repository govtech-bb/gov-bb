// The SDK is mocked so the real per-ARN caching / self-heal logic is what's
// under test, not AWS. Each test uses a distinct ARN so the module-level cache
// doesn't leak between cases.
const sendMock = vi.fn();
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    send = sendMock;
  },
  GetSecretValueCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

import { getCachedSecretJson, getCachedSecretString } from "./secrets";

beforeEach(() => {
  sendMock.mockReset();
});

describe("getCachedSecretString", () => {
  it("returns the SecretString from Secrets Manager", async () => {
    sendMock.mockResolvedValue({ SecretString: "plaintext" });
    expect(await getCachedSecretString("arn:string:basic")).toBe("plaintext");
  });

  it("caches per ARN — a second call does not hit Secrets Manager again", async () => {
    sendMock.mockResolvedValue({ SecretString: "v" });
    await getCachedSecretString("arn:string:cached");
    await getCachedSecretString("arn:string:cached");
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight call between concurrent callers", async () => {
    let resolve!: (r: { SecretString: string }) => void;
    sendMock.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const p1 = getCachedSecretString("arn:string:inflight");
    const p2 = getCachedSecretString("arn:string:inflight");
    resolve({ SecretString: "shared" });
    expect(await p1).toBe("shared");
    expect(await p2).toBe("shared");
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("throws when the secret has no SecretString", async () => {
    sendMock.mockResolvedValue({});
    await expect(getCachedSecretString("arn:string:empty")).rejects.toThrow(
      /no SecretString/,
    );
  });

  it("drops a failed promise so the next call retries (self-heal)", async () => {
    sendMock
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ SecretString: "recovered" });
    await expect(getCachedSecretString("arn:string:heal")).rejects.toThrow(
      "transient",
    );
    expect(await getCachedSecretString("arn:string:heal")).toBe("recovered");
    expect(sendMock).toHaveBeenCalledTimes(2);
  });
});

describe("getCachedSecretJson", () => {
  it("parses the SecretString as JSON", async () => {
    sendMock.mockResolvedValue({
      SecretString: JSON.stringify({ admin_token: "t", session_secret: "s" }),
    });
    expect(await getCachedSecretJson("arn:json:basic")).toEqual({
      admin_token: "t",
      session_secret: "s",
    });
  });

  it("types the parsed result via the generic parameter", async () => {
    sendMock.mockResolvedValue({
      SecretString: JSON.stringify({ username: "u", password: "p" }),
    });
    const creds = await getCachedSecretJson<{
      username: string;
      password: string;
    }>("arn:json:typed");
    expect(creds.username).toBe("u");
    expect(creds.password).toBe("p");
  });

  it("reuses the shared string cache (no extra Secrets Manager call)", async () => {
    sendMock.mockResolvedValue({ SecretString: JSON.stringify({ k: "v" }) });
    await getCachedSecretString("arn:json:shared");
    expect(await getCachedSecretJson("arn:json:shared")).toEqual({ k: "v" });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});

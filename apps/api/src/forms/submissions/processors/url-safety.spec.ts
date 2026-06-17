import type { Mock } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
import { lookup } from "node:dns/promises";
import { assertSafeUrl, isInternalIp, UnsafeUrlError } from "./url-safety";

const mockLookup = lookup as unknown as Mock;

const PUBLIC_V4 = [{ address: "93.184.216.34", family: 4 }];

beforeEach(() => {
  vi.clearAllMocks();
  // Default: hosts resolve to a public address unless a test overrides.
  mockLookup.mockResolvedValue(PUBLIC_V4);
});

describe("isInternalIp", () => {
  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "127.0.0.1",
    "169.254.169.254", // cloud metadata
    "172.16.5.4",
    "172.31.255.255",
    "192.168.1.1",
    "100.64.0.1", // CGNAT
    "::1",
    "::",
    "fc00::1", // ULA
    "fd12:3456::1", // ULA
    "fe80::1", // link-local
    "::ffff:169.254.169.254", // IPv4-mapped metadata
  ])("flags %s as internal", (ip) => {
    expect(isInternalIp(ip)).toBe(true);
  });

  it.each([
    "93.184.216.34",
    "8.8.8.8",
    "172.15.0.1", // just below the 172.16/12 range
    "172.32.0.1", // just above
    "100.63.0.1", // just below CGNAT
    "2606:2800:220:1:248:1893:25c8:1946", // public v6
    "not-an-ip",
  ])("treats %s as not internal", (ip) => {
    expect(isInternalIp(ip)).toBe(false);
  });
});

describe("assertSafeUrl", () => {
  it("accepts a public https host", async () => {
    await expect(
      assertSafeUrl("https://hooks.example.gov.bb/submissions"),
    ).resolves.toBeUndefined();
  });

  it("rejects a non-https scheme", async () => {
    await expect(assertSafeUrl("http://hooks.example.gov.bb")).rejects.toThrow(
      UnsafeUrlError,
    );
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("rejects an unparseable URL", async () => {
    await expect(assertSafeUrl("not a url")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects the cloud-metadata IP literal without a DNS lookup", async () => {
    await expect(
      assertSafeUrl(
        "https://169.254.169.254/latest/meta-data/iam/security-credentials/role",
      ),
    ).rejects.toThrow(/non-routable/);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it.each([
    "https://127.0.0.1/",
    "https://10.0.0.5/",
    "https://192.168.1.1/",
    "https://[::1]/",
  ])("rejects internal IP literal %s", async (url) => {
    await expect(assertSafeUrl(url)).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects a hostname that resolves to a private IP (DNS rebinding attempt)", async () => {
    mockLookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    await expect(assertSafeUrl("https://evil.example.com")).rejects.toThrow(
      /non-routable/,
    );
  });

  it("rejects when ANY resolved address is private", async () => {
    mockLookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.7", family: 4 },
    ]);
    await expect(assertSafeUrl("https://mixed.example.com")).rejects.toThrow(
      UnsafeUrlError,
    );
  });

  it("rejects when the host does not resolve", async () => {
    mockLookup.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertSafeUrl("https://nope.example.com")).rejects.toThrow(
      /resolve/,
    );
  });

  it("accepts a hostname that resolves to a public IP", async () => {
    mockLookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    await expect(
      assertSafeUrl("https://good.example.com"),
    ).resolves.toBeUndefined();
  });
});

import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/**
 * Thrown when a processor's outbound URL is rejected as unsafe (#287). Distinct
 * type so callers/tests can tell an SSRF rejection apart from a delivery error.
 */
export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

/** First 16-bit hextet of an IPv6 address as an integer (handles `::` / shortening). */
function firstHextet(ip: string): number {
  if (ip.startsWith("::")) return 0;
  return parseInt(ip.split(":")[0] || "0", 16);
}

function isInternalIpv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  if (a === 0) return true; // 0.0.0.0/8 (unspecified)
  if (a === 10) return true; // 10.0.0.0/8 (private)
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (private)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (private)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  return false;
}

function isInternalIpv6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === "::" || s === "::1") return true; // unspecified / loopback
  // IPv4-mapped (`::ffff:a.b.c.d`) — apply the IPv4 rules to the embedded address.
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isInternalIpv4(mapped[1]);
  const fh = firstHextet(s);
  if (fh >= 0xfc00 && fh <= 0xfdff) return true; // fc00::/7 (unique local)
  if (fh >= 0xfe80 && fh <= 0xfebf) return true; // fe80::/10 (link-local)
  return false;
}

/**
 * Whether an IP literal points at a private, loopback, link-local, or otherwise
 * non-routable destination — the addresses an SSRF payload would target
 * (notably the `169.254.169.254` cloud-metadata endpoint).
 */
export function isInternalIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isInternalIpv4(ip);
  if (version === 6) return isInternalIpv6(ip);
  return false; // not an IP literal
}

/**
 * SSRF guard for an outbound processor URL (#287). Enforces `https:` and that
 * the host does not resolve to an internal address, before any `fetch`. Throws
 * {@link UnsafeUrlError} on violation so the processor fails loudly rather than
 * delivering to (or leaking from) an internal endpoint.
 *
 * This resolves the host and validates the result, but does not pin the
 * connection to the validated IP — a fast-flipping DNS-rebinding attacker could
 * still bypass it (the actual `fetch` re-resolves). Closing that fully needs a
 * pinned dispatcher; out of scope here (see plan #287).
 */
export async function assertSafeUrl(raw: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError(`Invalid URL: ${raw}`);
  }

  if (url.protocol !== "https:") {
    throw new UnsafeUrlError(
      `URL must use https (got "${url.protocol}"): ${raw}`,
    );
  }

  // `URL.hostname` keeps the brackets for IPv6 literals — strip them before isIP.
  const host = url.hostname.replace(/^\[/, "").replace(/\]$/, "");

  if (isIP(host)) {
    if (isInternalIp(host)) {
      throw new UnsafeUrlError(`URL points at a non-routable address: ${host}`);
    }
    return;
  }

  let resolved: { address: string }[];
  try {
    resolved = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError(`Could not resolve host: ${host}`);
  }
  if (resolved.length === 0) {
    throw new UnsafeUrlError(`Host did not resolve: ${host}`);
  }
  for (const { address } of resolved) {
    if (isInternalIp(address)) {
      throw new UnsafeUrlError(
        `Host ${host} resolves to a non-routable address: ${address}`,
      );
    }
  }
}

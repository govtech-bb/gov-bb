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

/**
 * Expands a valid IPv6 literal to its 8 16-bit hextets. Handles `::`
 * compression and a trailing embedded IPv4 (`::ffff:1.2.3.4`), normalising the
 * dotted tail into two hextets so callers reason about the address numerically
 * rather than by text form. Returns null if it can't expand to exactly 8
 * hextets (the caller has already confirmed a valid IPv6 via `net.isIP`, so
 * this is a defensive guard).
 */
function ipv6ToHextets(ip: string): number[] | null {
  let s = ip.toLowerCase();

  // Convert a trailing embedded IPv4 (dotted) into two hex hextets so both
  // `::ffff:169.254.169.254` and `::ffff:a9fe:a9fe` expand identically.
  const v4 = s.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [, prefix, a, b, c, d] = v4;
    const hi = ((Number(a) << 8) | Number(b)).toString(16);
    const lo = ((Number(c) << 8) | Number(d)).toString(16);
    s = `${prefix}${hi}:${lo}`;
  }

  const parts = s.split("::");
  if (parts.length > 2) return null;
  const left = parts[0] ? parts[0].split(":") : [];
  const right = parts.length === 2 && parts[1] ? parts[1].split(":") : [];

  let groups: string[];
  if (parts.length === 2) {
    const fill = 8 - left.length - right.length;
    if (fill < 0) return null;
    groups = [...left, ...Array(fill).fill("0"), ...right];
  } else {
    groups = left;
  }
  if (groups.length !== 8) return null;
  return groups.map((h) => parseInt(h || "0", 16));
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
  const h = ipv6ToHextets(ip);
  if (!h) return false;

  const allZeroHigh = h.slice(0, 7).every((x) => x === 0);
  if (allZeroHigh && (h[7] === 0 || h[7] === 1)) return true; // :: / ::1

  // IPv4-mapped (::ffff:0:0/96) — apply the IPv4 rules to the embedded address,
  // recovered from the low 32 bits regardless of dotted or hex notation. This
  // closes the `::ffff:a9fe:a9fe` (= 169.254.169.254) bypass (#287).
  const isMapped =
    h[0] === 0 &&
    h[1] === 0 &&
    h[2] === 0 &&
    h[3] === 0 &&
    h[4] === 0 &&
    h[5] === 0xffff;
  if (isMapped) {
    const v4 = `${h[6] >> 8}.${h[6] & 0xff}.${h[7] >> 8}.${h[7] & 0xff}`;
    return isInternalIpv4(v4);
  }

  if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 (unique local)
  if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 (link-local)
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
 * the host does not resolve to an internal address, before the request is
 * dispatched. Throws {@link UnsafeUrlError} on violation so the processor fails
 * loudly rather than delivering to (or leaking from) an internal endpoint.
 *
 * This resolves the host and validates the result, but does not pin the
 * connection to the validated IP — a fast-flipping DNS-rebinding attacker could
 * still bypass it (the request re-resolves at dispatch). Closing that fully
 * needs a pinned dispatcher; out of scope here (see plan #287).
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

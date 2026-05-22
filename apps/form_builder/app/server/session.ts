import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const SESSION_COOKIE_NAME = "fb_session";
export const OAUTH_STATE_COOKIE_NAME = "fb_oauth_state";

/** 8 hours in seconds. */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
/** 10 minutes in seconds — covers the longest plausible OAuth round-trip. */
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

export interface SessionPayload {
  /** GitHub login (username). */
  login: string;
  /** GitHub access token (opaque string). Never written to logs. */
  accessToken: string;
  /** Epoch milliseconds when the session expires. */
  expiresAt: number;
}

function decodeSecret(secretBase64: string): Buffer {
  const key = Buffer.from(secretBase64, "base64");
  if (key.length !== 32) {
    throw new Error(
      `SESSION_SECRET must decode to exactly 32 bytes (got ${key.length}). Generate with: openssl rand -base64 32`,
    );
  }
  return key;
}

export function encrypt(payload: SessionPayload, secretBase64: string): string {
  const key = decodeSecret(secretBase64);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decrypt(blob: string, secretBase64: string): SessionPayload {
  const key = decodeSecret(secretBase64);
  const parts = blob.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed session blob");
  }
  const iv = Buffer.from(parts[0], "base64");
  const authTag = Buffer.from(parts[1], "base64");
  const ciphertext = Buffer.from(parts[2], "base64");
  if (iv.length !== 12) {
    throw new Error("Malformed session blob (bad IV)");
  }
  if (authTag.length !== 16) {
    throw new Error("Malformed session blob (bad auth tag)");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  const parsed = JSON.parse(plaintext.toString("utf8")) as SessionPayload;
  if (
    typeof parsed.login !== "string" ||
    typeof parsed.accessToken !== "string" ||
    typeof parsed.expiresAt !== "number"
  ) {
    throw new Error("Session payload shape invalid");
  }
  return parsed;
}

/** Build a `Set-Cookie` header value for the session cookie. */
export function serializeSessionCookie(
  value: string,
  opts: { secure: boolean; clear?: boolean; maxAgeSeconds?: number } = {
    secure: true,
  },
): string {
  const maxAge = opts.clear ? 0 : (opts.maxAgeSeconds ?? SESSION_TTL_SECONDS);
  const parts = [
    `${SESSION_COOKIE_NAME}=${value}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Build a `Set-Cookie` header value for the OAuth CSRF state cookie. */
export function serializeOAuthStateCookie(
  value: string,
  opts: { secure: boolean; clear?: boolean } = { secure: true },
): string {
  const maxAge = opts.clear ? 0 : OAUTH_STATE_TTL_SECONDS;
  const parts = [
    `${OAUTH_STATE_COOKIE_NAME}=${value}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Extract the value of `fb_session` from a `Cookie` header. Returns null if absent. */
export function parseSessionCookie(header: string | null): string | null {
  return parseNamedCookie(header, SESSION_COOKIE_NAME);
}

/** Extract the value of `fb_oauth_state` from a `Cookie` header. Returns null if absent. */
export function parseOAuthStateCookie(header: string | null): string | null {
  return parseNamedCookie(header, OAUTH_STATE_COOKIE_NAME);
}

function parseNamedCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  const parts = header.split(";");
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (k !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

/**
 * Constant-time string compare. Used for CSRF state comparison.
 * Returns false (without throwing) if lengths differ.
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Read + decrypt the current session from a Cookie header. Returns null if
 * the cookie is missing, malformed, decryption fails, or the session has
 * expired (server-side check, independent of the browser-side Max-Age).
 */
export function getSession(
  cookieHeader: string | null,
  secretBase64: string,
): SessionPayload | null {
  const blob = parseSessionCookie(cookieHeader);
  if (!blob) return null;
  let payload: SessionPayload;
  try {
    payload = decrypt(blob, secretBase64);
  } catch {
    return null;
  }
  if (payload.expiresAt < Date.now()) return null;
  return payload;
}

/**
 * Build the `Set-Cookie` header value to issue a new session.
 * Caller is responsible for actually attaching it to the response.
 */
export function setSession(
  payload: SessionPayload,
  secretBase64: string,
  opts: { secure: boolean } = { secure: true },
): string {
  const blob = encrypt(payload, secretBase64);
  return serializeSessionCookie(blob, opts);
}

/** Build the `Set-Cookie` header value that clears the session. */
export function clearSession(
  opts: { secure: boolean } = { secure: true },
): string {
  return serializeSessionCookie("", { secure: opts.secure, clear: true });
}

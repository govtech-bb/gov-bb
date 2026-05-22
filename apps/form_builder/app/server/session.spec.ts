import {
  serializeSessionCookie,
  parseSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  type SessionPayload,
} from "./session";
import {
  encrypt,
  decrypt,
  getSession,
  safeEqual,
} from "./session-cipher.server";
import { randomBytes } from "node:crypto";

const TEST_SECRET = randomBytes(32).toString("base64");

const SAMPLE_PAYLOAD: SessionPayload = {
  login: "alice",
  accessToken: "ghu_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  expiresAt: Date.now() + 1000 * 60 * 60, // +1h
};

describe("session encryption", () => {
  it("encrypts and decrypts a payload round-trip", () => {
    const blob = encrypt(SAMPLE_PAYLOAD, TEST_SECRET);
    const back = decrypt(blob, TEST_SECRET);
    expect(back).toEqual(SAMPLE_PAYLOAD);
  });

  it("produces a different ciphertext each call (random IV)", () => {
    const a = encrypt(SAMPLE_PAYLOAD, TEST_SECRET);
    const b = encrypt(SAMPLE_PAYLOAD, TEST_SECRET);
    expect(a).not.toEqual(b);
  });

  it("rejects a tampered ciphertext", () => {
    const blob = encrypt(SAMPLE_PAYLOAD, TEST_SECRET);
    const parts = blob.split(".");
    // Flip a byte in the ciphertext segment.
    const tampered = Buffer.from(parts[2], "base64");
    tampered[0] ^= 0xff;
    parts[2] = tampered.toString("base64");
    expect(() => decrypt(parts.join("."), TEST_SECRET)).toThrow();
  });

  it("rejects decrypt under a different secret", () => {
    const blob = encrypt(SAMPLE_PAYLOAD, TEST_SECRET);
    const otherSecret = randomBytes(32).toString("base64");
    expect(() => decrypt(blob, otherSecret)).toThrow();
  });

  it("rejects a malformed blob", () => {
    expect(() => decrypt("garbage", TEST_SECRET)).toThrow();
    expect(() => decrypt("a.b", TEST_SECRET)).toThrow();
    expect(() => decrypt("", TEST_SECRET)).toThrow();
  });

  it("rejects a secret of the wrong length", () => {
    const tooShort = Buffer.alloc(16).toString("base64");
    expect(() => encrypt(SAMPLE_PAYLOAD, tooShort)).toThrow(/32 bytes/);
  });

  it("rejects a tampered auth tag", () => {
    const blob = encrypt(SAMPLE_PAYLOAD, TEST_SECRET);
    const parts = blob.split(".");
    const tampered = Buffer.from(parts[1], "base64");
    tampered[0] ^= 0xff;
    parts[1] = tampered.toString("base64");
    expect(() => decrypt(parts.join("."), TEST_SECRET)).toThrow();
  });

  it("rejects a truncated auth tag", () => {
    const blob = encrypt(SAMPLE_PAYLOAD, TEST_SECRET);
    const parts = blob.split(".");
    // Replace the auth tag with a short (4-byte) tag.
    parts[1] = Buffer.alloc(4).toString("base64");
    expect(() => decrypt(parts.join("."), TEST_SECRET)).toThrow(/auth tag/i);
  });
});

describe("serializeSessionCookie", () => {
  it("includes HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age", () => {
    const cookie = serializeSessionCookie("opaque-value", { secure: true });
    expect(cookie).toMatch(/^fb_session=opaque-value;/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(new RegExp(`Max-Age=${SESSION_TTL_SECONDS}`));
  });

  it("omits Secure when secure:false (dev/localhost)", () => {
    const cookie = serializeSessionCookie("opaque-value", { secure: false });
    expect(cookie).not.toMatch(/Secure/);
  });

  it("supports a clear directive (Max-Age=0, empty value)", () => {
    const cookie = serializeSessionCookie("", { secure: true, clear: true });
    expect(cookie).toMatch(/^fb_session=;/);
    expect(cookie).toMatch(/Max-Age=0/);
  });

  it("uses the configured cookie name", () => {
    expect(SESSION_COOKIE_NAME).toBe("fb_session");
  });
});

describe("parseSessionCookie", () => {
  it("extracts the named cookie from a Cookie header", () => {
    const header = "foo=bar; fb_session=opaque; baz=qux";
    expect(parseSessionCookie(header)).toBe("opaque");
  });

  it("returns null when the cookie is absent", () => {
    expect(parseSessionCookie("foo=bar")).toBeNull();
    expect(parseSessionCookie("")).toBeNull();
    expect(parseSessionCookie(null)).toBeNull();
  });

  it("handles URL-encoded values", () => {
    // The opaque blob contains '.' and '/' (base64), which are not URL-encoded
    // anyway, but parse should be tolerant.
    const header = "fb_session=abc%2Bdef%2Fghi";
    expect(parseSessionCookie(header)).toBe("abc+def/ghi");
  });
});

describe("getSession", () => {
  it("returns the payload for a live session", () => {
    const blob = encrypt(SAMPLE_PAYLOAD, TEST_SECRET);
    expect(getSession(`fb_session=${blob}`, TEST_SECRET)).toEqual(
      SAMPLE_PAYLOAD,
    );
  });

  it("returns null for an expired session", () => {
    const expired: SessionPayload = {
      ...SAMPLE_PAYLOAD,
      expiresAt: Date.now() - 1,
    };
    const blob = encrypt(expired, TEST_SECRET);
    expect(getSession(`fb_session=${blob}`, TEST_SECRET)).toBeNull();
  });

  it("returns null when the cookie header is missing", () => {
    expect(getSession(null, TEST_SECRET)).toBeNull();
    expect(getSession("", TEST_SECRET)).toBeNull();
  });

  it("returns null when the blob is unparseable", () => {
    expect(getSession("fb_session=not-a-blob", TEST_SECRET)).toBeNull();
  });

  it("returns null when the blob is tampered", () => {
    const blob = encrypt(SAMPLE_PAYLOAD, TEST_SECRET);
    const parts = blob.split(".");
    const tampered = Buffer.from(parts[2], "base64");
    tampered[0] ^= 0xff;
    parts[2] = tampered.toString("base64");
    expect(getSession(`fb_session=${parts.join(".")}`, TEST_SECRET)).toBeNull();
  });
});

describe("safeEqual", () => {
  it("returns true for identical strings", () => {
    expect(safeEqual("abc123", "abc123")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(safeEqual("abc123", "xyz789")).toBe(false);
  });

  it("returns false for strings of different lengths", () => {
    expect(safeEqual("short", "longer-string")).toBe(false);
  });

  it("returns true for two empty strings", () => {
    expect(safeEqual("", "")).toBe(true);
  });
});

import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { parseConfig } from "./config";

const required = {
  BETTER_AUTH_URL: "http://localhost:3020",
  EDITOR_ORIGIN: "http://localhost:3000",
  BETTER_AUTH_SECRET: "test-only-secret-with-at-least-32-characters",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  GOOGLE_ALLOWED_DOMAINS: "govtech.bb",
  API_V2_ADMIN_EMAILS: "admin@govtech.bb",
};

describe("auth configuration", () => {
  it("reads the Google client and the allowed Workspace domains, lowercased", () => {
    const result = parseConfig({
      ...required,
      GOOGLE_ALLOWED_DOMAINS: " GovTech.bb , health.gov.bb ",
    });
    if (!result.ok) throw result.error;
    expect(result.value.auth.googleClientId).toBe("test-client");
    expect(result.value.auth.googleClientSecret.reveal()).toBe(
      "test-client-secret",
    );
    expect(result.value.auth.allowedDomains).toEqual([
      "govtech.bb",
      "health.gov.bb",
    ]);
  });
  it.each([
    ["GOOGLE_CLIENT_ID", undefined],
    ["GOOGLE_CLIENT_SECRET", undefined],
    ["GOOGLE_ALLOWED_DOMAINS", undefined],
    ["GOOGLE_ALLOWED_DOMAINS", " , "],
    ["GOOGLE_ALLOWED_DOMAINS", "@govtech.bb"],
    ["GOOGLE_ALLOWED_DOMAINS", "govtech"],
  ])("refuses to start with %s set to %j", (field, value) => {
    const result = parseConfig({ ...required, [field]: value });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.message).toBe(`Invalid configuration: ${field}`);
  });
  it("no longer reads GitHub OAuth settings", () => {
    const result = parseConfig({
      ...required,
      GITHUB_CLIENT_ID: "github-client",
      GITHUB_CLIENT_SECRET: "github-secret",
    });
    if (!result.ok) throw result.error;
    expect(JSON.stringify(result.value)).not.toContain("github");
  });
  it("fails closed without required settings and never prints their values", () => {
    const missing = parseConfig({});
    expect(missing.ok).toBe(false);
    const invalid = parseConfig({ ...required, BETTER_AUTH_SECRET: "short" });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok)
      expect(invalid.error.message).toBe(
        "Invalid configuration: BETTER_AUTH_SECRET",
      );
  });
  it("rejects non-origin URLs and requires HTTPS in production", () => {
    expect(parseConfig({ ...required, BETTER_AUTH_URL: "not a URL" }).ok).toBe(
      false,
    );
    expect(
      parseConfig({ ...required, EDITOR_ORIGIN: "https://editor.example/path" })
        .ok,
    ).toBe(false);
    expect(parseConfig({ ...required, NODE_ENV: "production" }).ok).toBe(false);
    expect(
      parseConfig({
        ...required,
        NODE_ENV: "production",
        EDITOR_ORIGIN: "https://editor.example",
        BETTER_AUTH_URL: "https://api.example",
      }).ok,
    ).toBe(true);
  });
  it("seeds only when asked to, in any spelling of yes", () => {
    const seed = (value: string | undefined) => {
      const result = parseConfig({ ...required, SEED: value });
      if (!result.ok) throw result.error;
      return result.value.seed;
    };
    expect([undefined, "false", "0"].map(seed)).toEqual([false, false, false]);
    expect(["true", "1", "yes"].map(seed)).toEqual([true, true, true]);
  });
  it("refuses to seed in production", () => {
    const production = {
      ...required,
      NODE_ENV: "production",
      EDITOR_ORIGIN: "https://editor.example",
      BETTER_AUTH_URL: "https://api.example",
    };
    expect(parseConfig({ ...production, SEED: "false" }).ok).toBe(true);
    const refused = parseConfig({ ...production, SEED: "true" });
    expect(refused.ok).toBe(false);
    if (!refused.ok)
      expect(refused.error.message).toBe("Invalid configuration: SEED");
  });
  it("keeps existing runtime defaults while redacting all credential representations", () => {
    const result = parseConfig(required);
    if (!result.ok) throw result.error;
    expect(result.value).toMatchObject({
      port: 3020,
      seed: false,
      database: { host: "localhost", port: 5432, database: "gov_bb_v2" },
    });
    expect(result.value.auth.secret.reveal()).toBe(required.BETTER_AUTH_SECRET);
    for (const rendered of [
      JSON.stringify(result.value),
      inspect(result.value),
      String(result.value.auth.secret),
    ]) {
      expect(rendered).not.toContain(required.BETTER_AUTH_SECRET);
      expect(rendered).not.toContain(required.GOOGLE_CLIENT_SECRET);
    }
  });
});

describe("auth bypass", () => {
  const bypassed = (input: Record<string, string>) => {
    const parsed = parseConfig({ ...required, ...input });
    return parsed.ok ? parsed.value.authBypass : "refused";
  };

  it("is off unless asked for", () => {
    expect(bypassed({})).toBe(false);
    expect(bypassed({ AUTH_BYPASS: "false" })).toBe(false);
  });

  it("is allowed only for a local editor outside production", () => {
    expect(bypassed({ AUTH_BYPASS: "true" })).toBe(true);
    expect(
      bypassed({
        AUTH_BYPASS: "true",
        EDITOR_ORIGIN: "http://127.0.0.1:3000",
      }),
    ).toBe(true);
    expect(
      bypassed({
        AUTH_BYPASS: "true",
        EDITOR_ORIGIN: "https://editor.example",
      }),
    ).toBe("refused");
    expect(
      bypassed({
        AUTH_BYPASS: "true",
        NODE_ENV: "production",
        EDITOR_ORIGIN: "https://editor.example",
        BETTER_AUTH_URL: "https://api.example",
      }),
    ).toBe("refused");
    expect(
      bypassed({
        AUTH_BYPASS: "true",
        NODE_ENV: "production",
        EDITOR_ORIGIN: "http://localhost:3000",
        BETTER_AUTH_URL: "https://api.example",
      }),
    ).toBe("refused");
  });
});

describe("admin emails", () => {
  const admins = (input: Record<string, string>) => {
    const parsed = parseConfig({ ...required, ...input });
    return parsed.ok ? parsed.value.adminEmails : parsed.error.fields;
  };

  it("refuses to start without one, since nobody could grant approver", () => {
    for (const unset of [
      { API_V2_ADMIN_EMAILS: "" },
      { API_V2_ADMIN_EMAILS: " , " },
    ]) {
      const parsed = parseConfig({ ...required, ...unset });
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.error.fields).toEqual(["API_V2_ADMIN_EMAILS"]);
        expect(parsed.error.reasons).toEqual([
          expect.stringContaining("ADR 0134"),
        ]);
      }
    }
    const withoutAdmins: Record<string, string> = { ...required };
    delete withoutAdmins.API_V2_ADMIN_EMAILS;
    expect(parseConfig(withoutAdmins).ok).toBe(false);
  });

  it("needs none under AUTH_BYPASS, whose developer holds every role", () => {
    expect(admins({ API_V2_ADMIN_EMAILS: "", AUTH_BYPASS: "true" })).toEqual(
      [],
    );
  });

  it("reads a comma-separated list, lowercased", () => {
    expect(
      admins({ API_V2_ADMIN_EMAILS: " Ada@govtech.bb, ,grace@govtech.bb" }),
    ).toEqual(["ada@govtech.bb", "grace@govtech.bb"]);
  });

  it("refuses something that is not an email", () => {
    expect(admins({ API_V2_ADMIN_EMAILS: "ada" })).toEqual([
      "API_V2_ADMIN_EMAILS",
    ]);
  });
});

describe("email moves", () => {
  const moves = (value: string) => {
    const parsed = parseConfig({ ...required, API_V2_EMAIL_MOVES: value });
    return parsed.ok ? parsed.value.emailMoves : parsed.error.fields;
  };

  it("are none by default", () => {
    const parsed = parseConfig(required);
    if (!parsed.ok) throw parsed.error;
    expect(parsed.value.emailMoves).toEqual([]);
  });

  it("reads comma-separated old=new pairs, lowercased", () => {
    expect(
      moves(
        " Ada@Gmail.com = Ada@govtech.bb, ,grace@icloud.com=grace@govtech.bb",
      ),
    ).toEqual([
      { from: "ada@gmail.com", to: "ada@govtech.bb" },
      { from: "grace@icloud.com", to: "grace@govtech.bb" },
    ]);
  });

  it.each([
    "ada@gmail.com",
    "ada=ada@govtech.bb",
    "ada@gmail.com=ada@gmail.org",
    "ada@gmail.com=ada@govtech.bb=junk",
    // The same user on both sides would be found twice and deleted.
    "ada@govtech.bb=ada@govtech.bb",
    "Ada@govtech.bb=ada@GovTech.bb",
  ])("refuses %s", (value) => {
    expect(moves(value)).toEqual(["API_V2_EMAIL_MOVES"]);
  });

  it("keeps the addresses out of the reasons it gives", () => {
    for (const value of [
      "ada@gmail.com=ada@gmail.org",
      "ada@govtech.bb=ada@govtech.bb",
    ]) {
      const parsed = parseConfig({ ...required, API_V2_EMAIL_MOVES: value });
      expect(parsed.ok).toBe(false);
      if (!parsed.ok)
        expect(parsed.error.reasons.join(" ")).not.toMatch(/ada@/);
    }
  });
});

describe("review notifications", () => {
  const production = {
    ...required,
    NODE_ENV: "production",
    EDITOR_ORIGIN: "https://editor.example",
    BETTER_AUTH_URL: "https://api.example",
  };

  it("are off by default, and sent through SES from the configured sender when on", () => {
    const off = parseConfig(production);
    const on = parseConfig({
      ...production,
      REVIEW_NOTIFICATIONS: "ses",
      SES_FROM_ADDRESS: "noreply@gov.bb",
      AWS_DEFAULT_REGION: "us-east-2",
    });
    expect(off.ok && off.value.notifications).toEqual({ transport: "off" });
    expect(on.ok && on.value.notifications).toEqual({
      transport: "ses",
      from: "noreply@gov.bb",
      region: "us-east-2",
    });
  });

  it("refuses SES without a sender, saying which setting to fix", () => {
    const refused = parseConfig({
      ...production,
      REVIEW_NOTIFICATIONS: "ses",
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.fields).toEqual(["SES_FROM_ADDRESS"]);
      expect(refused.error.reasons).toEqual([
        expect.stringContaining("verified SES sender"),
      ]);
    }
  });

  it("logs them only outside production", () => {
    const local = parseConfig({ ...required, REVIEW_NOTIFICATIONS: "log" });
    expect(local.ok && local.value.notifications).toEqual({ transport: "log" });
    const refused = parseConfig({ ...production, REVIEW_NOTIFICATIONS: "log" });
    expect(!refused.ok && refused.error.fields).toEqual([
      "REVIEW_NOTIFICATIONS",
    ]);
  });
});

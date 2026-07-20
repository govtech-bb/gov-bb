import { describe, it, expect } from "vitest";
import {
  webhookUrlEnv,
  webhookSecretEnv,
  webhookUrlToken,
  webhookSecretToken,
} from "./webhook-env";

describe("webhook-env convention", () => {
  it("builds the URL/secret var names from a token", () => {
    expect(webhookUrlEnv("SCIENCE_CAMP")).toBe("WEBHOOK_URL_SCIENCE_CAMP");
    expect(webhookSecretEnv("BYAC")).toBe("WEBHOOK_SECRET_BYAC");
  });

  it("extracts the token from a conforming name", () => {
    expect(webhookUrlToken("WEBHOOK_URL_SCIENCE_CAMP")).toBe("SCIENCE_CAMP");
    expect(webhookSecretToken("WEBHOOK_SECRET_BYAC")).toBe("BYAC");
  });

  it("round-trips: env name ⇄ token", () => {
    expect(webhookUrlToken(webhookUrlEnv("YDP"))).toBe("YDP");
    expect(webhookSecretToken(webhookSecretEnv("CAMP_2026"))).toBe("CAMP_2026");
  });

  it("rejects the bare shared vars and wrong prefixes", () => {
    expect(webhookUrlToken("WEBHOOK_URL")).toBeNull(); // no token
    expect(webhookUrlToken("WEBHOOK_SECRET_BYAC")).toBeNull(); // wrong prefix
    expect(webhookSecretToken("WEBHOOK_URL_BYAC")).toBeNull();
  });

  it("rejects non-conforming tokens", () => {
    expect(webhookUrlToken("WEBHOOK_URL_science_camp")).toBeNull(); // lowercase
    expect(webhookUrlToken("WEBHOOK_URL_")).toBeNull(); // empty
    expect(webhookUrlToken("WEBHOOK_URL_A__B")).toBeNull(); // double underscore
    expect(webhookUrlToken("WEBHOOK_URL_A-B")).toBeNull(); // hyphen
  });
});

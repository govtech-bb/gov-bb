import type { Mocked } from "vitest";
import { WebhookDestinationsService } from "./webhook-destinations.service";
import type { FormConfigService } from "@/forms/form-config/form-config.service";

const ENV_KEY = "MDA_WEBHOOK_DESTINATIONS";

function makeService(
  json: string | undefined,
  ministryKey: string | null = null,
  referencedMinistryKeys: string[] = [],
) {
  if (json === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = json;

  const formConfig = {
    resolveMinistryKey: vi.fn().mockResolvedValue(ministryKey),
    listConfiguredMinistryKeys: vi
      .fn()
      .mockResolvedValue(referencedMinistryKeys),
  } as unknown as Mocked<FormConfigService>;

  const service = new WebhookDestinationsService(formConfig);
  return { service, formConfig };
}

const CONFIG = JSON.stringify({
  youth: { url: "https://youth/api", secret: "y-key" },
  education: { url: "https://edu/api", secret: "e-key" },
});

afterEach(() => {
  delete process.env[ENV_KEY];
  vi.restoreAllMocks();
});

describe("WebhookDestinationsService", () => {
  it("resolves a destination via formId → ministry key → JSON entry", async () => {
    const { service, formConfig } = makeService(CONFIG, "youth");
    await expect(service.resolveWebhookDestination("f1")).resolves.toEqual({
      url: "https://youth/api",
      secret: "y-key",
    });
    expect(formConfig.resolveMinistryKey).toHaveBeenCalledWith("f1");
  });

  it("returns null when the form has no ministry key (unmapped MDA)", async () => {
    const { service } = makeService(CONFIG, null);
    await expect(service.resolveWebhookDestination("f1")).resolves.toBeNull();
  });

  it("returns null when the ministry key has no entry in the JSON", async () => {
    const { service } = makeService(CONFIG, "health");
    await expect(service.resolveWebhookDestination("f1")).resolves.toBeNull();
  });

  it("exposes configured ministries and no issues for a valid blob", () => {
    const { service } = makeService(CONFIG);
    expect(service.configuredMinistries().sort()).toEqual([
      "education",
      "youth",
    ]);
    expect(service.getIssues()).toEqual([]);
  });

  it("collects issues (not throws) for a malformed blob and resolves null", async () => {
    const { service } = makeService("{bad json", "youth");
    expect(service.getIssues()).toHaveLength(1);
    expect(service.configuredMinistries()).toEqual([]);
    await expect(service.resolveWebhookDestination("f1")).resolves.toBeNull();
  });
});

describe("WebhookDestinationsService — deploy-time audit", () => {
  it("reports OK when every referenced ministry has an entry", async () => {
    const { service } = makeService(CONFIG, null, ["youth", "education"]);
    await service.onApplicationBootstrap();
    expect(service.getAudit()).toEqual({
      issues: [],
      missingMinistries: [],
      configuredMinistries: expect.arrayContaining(["youth", "education"]),
      ok: true,
    });
  });

  it("flags a referenced ministry that is missing from the JSON", async () => {
    const { service } = makeService(CONFIG, null, ["youth", "health"]);
    await service.onApplicationBootstrap();
    const audit = service.getAudit();
    expect(audit.missingMinistries).toEqual(["health"]);
    expect(audit.ok).toBe(false);
  });

  it("carries parse issues into the audit and never throws on a DB error", async () => {
    const { service, formConfig } = makeService("{bad json", null, []);
    vi.mocked(formConfig.listConfiguredMinistryKeys).mockRejectedValue(
      new Error("db down"),
    );
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(service.getAudit().issues).toHaveLength(1);
    expect(service.getAudit().ok).toBe(false);
  });
});

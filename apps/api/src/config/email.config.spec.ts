import emailConfig from "./email.config";

/**
 * The qaNotifyRecipient gate is the prod-safety guarantee for the QA
 * notify hook: QA_MDA_NOTIFY must only ever surface in an explicitly
 * non-prod environment, never in production and never by default.
 */
describe("email.config — qaNotifyRecipient gate", () => {
  const ORIGINAL = {
    APP_ENV: process.env.APP_ENV,
    NODE_ENV: process.env.NODE_ENV,
    QA_MDA_NOTIFY: process.env.QA_MDA_NOTIFY,
  };

  function set(key: keyof typeof ORIGINAL, value: string | undefined) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  afterEach(() => {
    set("APP_ENV", ORIGINAL.APP_ENV);
    set("NODE_ENV", ORIGINAL.NODE_ENV);
    set("QA_MDA_NOTIFY", ORIGINAL.QA_MDA_NOTIFY);
  });

  const load = () => emailConfig();

  it("exposes QA_MDA_NOTIFY on staging", () => {
    set("APP_ENV", "staging");
    set("QA_MDA_NOTIFY", "qa@govtech.bb");
    expect(load().qaNotifyRecipient).toBe("qa@govtech.bb");
  });

  it("exposes QA_MDA_NOTIFY on sandbox", () => {
    set("APP_ENV", "sandbox");
    set("QA_MDA_NOTIFY", "qa@govtech.bb");
    expect(load().qaNotifyRecipient).toBe("qa@govtech.bb");
  });

  it("exposes QA_MDA_NOTIFY when NODE_ENV=development", () => {
    set("APP_ENV", undefined);
    set("NODE_ENV", "development");
    set("QA_MDA_NOTIFY", "qa@govtech.bb");
    expect(load().qaNotifyRecipient).toBe("qa@govtech.bb");
  });

  it("IGNORES QA_MDA_NOTIFY in production (APP_ENV=production)", () => {
    set("APP_ENV", "production");
    set("NODE_ENV", "production");
    set("QA_MDA_NOTIFY", "qa@govtech.bb");
    expect(load().qaNotifyRecipient).toBeUndefined();
  });

  it("IGNORES QA_MDA_NOTIFY when APP_ENV is unset (fail-safe default)", () => {
    set("APP_ENV", undefined);
    set("NODE_ENV", "production");
    set("QA_MDA_NOTIFY", "qa@govtech.bb");
    expect(load().qaNotifyRecipient).toBeUndefined();
  });
});

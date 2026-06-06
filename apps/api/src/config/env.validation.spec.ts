import { envValidationSchema } from "./env.validation";

const baseEnv = {
  DB_HOST: "localhost",
  DB_USERNAME: "postgres",
  DB_PASSWORD: "postgres",
  DB_NAME: "modular_forms",
  EZPAY_BASE_URL: "https://test.ezpay.gov.bb",
  EZPAY_DEPARTMENT_API_KEYS: "{}",
  EZPAY_WEBHOOK_SECRET: "test-webhook-secret",
};

describe("envValidationSchema", () => {
  describe("CORS_ORIGIN — production guard", () => {
    it("rejects '*' wildcard in production", () => {
      const { error } = envValidationSchema.validate(
        { ...baseEnv, NODE_ENV: "production", CORS_ORIGIN: "*" },
        { allowUnknown: true, abortEarly: false },
      );
      expect(error?.message).toMatch(/CORS_ORIGIN/);
      expect(error?.message).toMatch(/\*/);
    });

    it("rejects 'localhost' in production", () => {
      const { error } = envValidationSchema.validate(
        {
          ...baseEnv,
          NODE_ENV: "production",
          CORS_ORIGIN: "http://localhost:3000",
        },
        { allowUnknown: true, abortEarly: false },
      );
      expect(error?.message).toMatch(/CORS_ORIGIN/);
      expect(error?.message).toMatch(/localhost/);
    });

    it("rejects '127.0.0.1' in production", () => {
      const { error } = envValidationSchema.validate(
        {
          ...baseEnv,
          NODE_ENV: "production",
          CORS_ORIGIN: "http://127.0.0.1:3000",
        },
        { allowUnknown: true, abortEarly: false },
      );
      expect(error?.message).toMatch(/127\.0\.0\.1/);
    });

    it("rejects when one origin in a comma list is unsafe", () => {
      const { error } = envValidationSchema.validate(
        {
          ...baseEnv,
          NODE_ENV: "production",
          CORS_ORIGIN: "https://gov.bb,http://localhost:3000",
        },
        { allowUnknown: true, abortEarly: false },
      );
      expect(error?.message).toMatch(/localhost/);
    });

    it("accepts safe production origins", () => {
      const { error } = envValidationSchema.validate(
        {
          ...baseEnv,
          NODE_ENV: "production",
          CORS_ORIGIN: "https://forms.gov.bb,https://staging.forms.gov.bb",
        },
        { allowUnknown: true, abortEarly: false },
      );
      expect(error).toBeUndefined();
    });

    it("requires CORS_ORIGIN to be set in production", () => {
      const { error } = envValidationSchema.validate(
        { ...baseEnv, NODE_ENV: "production" },
        { allowUnknown: true, abortEarly: false },
      );
      expect(error?.message).toMatch(/CORS_ORIGIN/);
    });

    it("defaults CORS_ORIGIN to localhost in development", () => {
      const { error, value } = envValidationSchema.validate(
        { ...baseEnv, NODE_ENV: "development" },
        { allowUnknown: true, abortEarly: false },
      );
      expect(error).toBeUndefined();
      expect(value.CORS_ORIGIN).toBe("http://localhost:3000");
    });

    it("allows localhost in development", () => {
      const { error } = envValidationSchema.validate(
        {
          ...baseEnv,
          NODE_ENV: "development",
          CORS_ORIGIN: "http://localhost:3000",
        },
        { allowUnknown: true, abortEarly: false },
      );
      expect(error).toBeUndefined();
    });
  });

  describe("NODE_ENV", () => {
    it("defaults to development", () => {
      const { value } = envValidationSchema.validate(
        { ...baseEnv },
        { allowUnknown: true, abortEarly: false },
      );
      expect(value.NODE_ENV).toBe("development");
    });

    it("rejects unknown values", () => {
      const { error } = envValidationSchema.validate(
        { ...baseEnv, NODE_ENV: "staging" },
        { allowUnknown: true, abortEarly: false },
      );
      expect(error?.message).toMatch(/NODE_ENV/);
    });
  });

  describe("EZPAY webhook signature verification", () => {
    it("defaults verification to enabled", () => {
      const { error, value } = envValidationSchema.validate(
        { ...baseEnv },
        { allowUnknown: true, abortEarly: false },
      );
      expect(error).toBeUndefined();
      expect(value.EZPAY_WEBHOOK_VERIFY_SIGNATURE).toBe("true");
    });

    it("requires a webhook secret when verification is enabled by default", () => {
      const { EZPAY_WEBHOOK_SECRET: _secret, ...envWithoutSecret } = baseEnv;
      const { error } = envValidationSchema.validate(
        { ...envWithoutSecret },
        { allowUnknown: true, abortEarly: false },
      );
      expect(error?.message).toMatch(/EZPAY_WEBHOOK_SECRET/);
    });

    it("allows explicit local development opt-out", () => {
      const { error, value } = envValidationSchema.validate(
        {
          ...baseEnv,
          NODE_ENV: "development",
          EZPAY_WEBHOOK_VERIFY_SIGNATURE: "false",
          EZPAY_WEBHOOK_SECRET: "",
        },
        { allowUnknown: true, abortEarly: false },
      );
      expect(error).toBeUndefined();
      expect(value.EZPAY_WEBHOOK_VERIFY_SIGNATURE).toBe("false");
    });

    it("rejects disabled verification in production", () => {
      const { error } = envValidationSchema.validate(
        {
          ...baseEnv,
          NODE_ENV: "production",
          CORS_ORIGIN: "https://forms.gov.bb",
          EZPAY_WEBHOOK_VERIFY_SIGNATURE: "false",
          EZPAY_WEBHOOK_SECRET: "",
        },
        { allowUnknown: true, abortEarly: false },
      );
      expect(error?.message).toMatch(/EZPAY_WEBHOOK_VERIFY_SIGNATURE/);
      expect(error?.message).toMatch(/production/);
    });
  });

  describe("SES_DEFAULT_RECIPIENT", () => {
    it("defaults to the shared test inbox so sandbox never emails a real MDA", () => {
      const { error, value } = envValidationSchema.validate(
        { ...baseEnv },
        { allowUnknown: true, abortEarly: false },
      );
      expect(error).toBeUndefined();
      expect(value.SES_DEFAULT_RECIPIENT).toBe("testing@govtech.bb");
    });

    it("honours an explicit override", () => {
      const { value } = envValidationSchema.validate(
        { ...baseEnv, SES_DEFAULT_RECIPIENT: "ops@gov.bb" },
        { allowUnknown: true, abortEarly: false },
      );
      expect(value.SES_DEFAULT_RECIPIENT).toBe("ops@gov.bb");
    });
  });
});

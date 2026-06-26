import { envValidationSchema } from "./env.validation";

// Minimal env satisfying every unconditionally-required var (no default,
// not optional): the four DB creds and the two EzPay vars. Mirrors the set
// the Joi schema required before this migration.
const baseEnv = {
  DB_HOST: "localhost",
  DB_USERNAME: "postgres",
  DB_PASSWORD: "postgres",
  DB_NAME: "modular_forms",
  EZPAY_BASE_URL: "https://test.ezpay.gov.bb",
  EZPAY_DEPARTMENT_API_KEYS: "{}",
};

// Adapter to the old Joi `.validate()` shape so the behavioural assertions read
// the same: { error, value }. envValidationSchema is now a Zod schema.
const validate = (env: Record<string, unknown>) => {
  const result = envValidationSchema.safeParse(env);
  return {
    error: result.success ? undefined : result.error,
    value: result.success ? result.data : undefined,
  };
};

describe("envValidationSchema", () => {
  describe("CORS_ORIGIN — production guard", () => {
    it("rejects '*' wildcard in production", () => {
      const { error } = validate({
        ...baseEnv,
        NODE_ENV: "production",
        CORS_ORIGIN: "*",
      });
      expect(error?.message).toMatch(/CORS_ORIGIN/);
      expect(error?.message).toMatch(/\*/);
    });

    it("rejects 'localhost' in production", () => {
      const { error } = validate({
        ...baseEnv,
        NODE_ENV: "production",
        CORS_ORIGIN: "http://localhost:3000",
      });
      expect(error?.message).toMatch(/CORS_ORIGIN/);
      expect(error?.message).toMatch(/localhost/);
    });

    it("rejects '127.0.0.1' in production", () => {
      const { error } = validate({
        ...baseEnv,
        NODE_ENV: "production",
        CORS_ORIGIN: "http://127.0.0.1:3000",
      });
      expect(error?.message).toMatch(/127\.0\.0\.1/);
    });

    it("rejects when one origin in a comma list is unsafe", () => {
      const { error } = validate({
        ...baseEnv,
        NODE_ENV: "production",
        CORS_ORIGIN: "https://gov.bb,http://localhost:3000",
      });
      expect(error?.message).toMatch(/localhost/);
    });

    it("accepts safe production origins", () => {
      const { error } = validate({
        ...baseEnv,
        NODE_ENV: "production",
        CORS_ORIGIN: "https://forms.gov.bb,https://staging.forms.gov.bb",
      });
      expect(error).toBeUndefined();
    });

    it("requires CORS_ORIGIN to be set in production", () => {
      const { error } = validate({ ...baseEnv, NODE_ENV: "production" });
      expect(error?.message).toMatch(/CORS_ORIGIN/);
    });

    it("defaults CORS_ORIGIN to localhost in development", () => {
      const { error, value } = validate({
        ...baseEnv,
        NODE_ENV: "development",
      });
      expect(error).toBeUndefined();
      expect(value?.CORS_ORIGIN).toBe("http://localhost:3000");
    });

    it("allows localhost in development", () => {
      const { error } = validate({
        ...baseEnv,
        NODE_ENV: "development",
        CORS_ORIGIN: "http://localhost:3000",
      });
      expect(error).toBeUndefined();
    });
  });

  describe("NODE_ENV", () => {
    it("defaults to development", () => {
      const { value } = validate({ ...baseEnv });
      expect(value?.NODE_ENV).toBe("development");
    });

    it("rejects unknown values", () => {
      const { error } = validate({ ...baseEnv, NODE_ENV: "staging" });
      expect(error?.message).toMatch(/NODE_ENV/);
    });
  });

  describe("required vars", () => {
    it("rejects a missing DB_HOST", () => {
      const { DB_HOST, ...rest } = baseEnv;
      void DB_HOST;
      const { error } = validate(rest);
      expect(error?.message).toMatch(/DB_HOST/);
    });

    it("rejects an empty-string required var (Joi `.required()` parity)", () => {
      const { error } = validate({ ...baseEnv, DB_NAME: "" });
      expect(error?.message).toMatch(/DB_NAME/);
    });

    it("rejects a non-URL EZPAY_BASE_URL", () => {
      const { error } = validate({ ...baseEnv, EZPAY_BASE_URL: "not-a-url" });
      expect(error?.message).toMatch(/EZPAY_BASE_URL/);
    });

    it("rejects a missing EZPAY_DEPARTMENT_API_KEYS", () => {
      const { EZPAY_DEPARTMENT_API_KEYS, ...rest } = baseEnv;
      void EZPAY_DEPARTMENT_API_KEYS;
      const { error } = validate(rest);
      expect(error?.message).toMatch(/EZPAY_DEPARTMENT_API_KEYS/);
    });
  });

  describe("SQS_QUEUE_URL — conditional on SQS_ENABLED", () => {
    it("requires SQS_QUEUE_URL when SQS_ENABLED=true", () => {
      const { error } = validate({ ...baseEnv, SQS_ENABLED: "true" });
      expect(error?.message).toMatch(/SQS_QUEUE_URL/);
    });

    it("accepts a valid SQS_QUEUE_URL when enabled", () => {
      const { error } = validate({
        ...baseEnv,
        SQS_ENABLED: "true",
        SQS_QUEUE_URL: "https://sqs.ca-central-1.amazonaws.com/123/q",
      });
      expect(error).toBeUndefined();
    });

    it("allows SQS_QUEUE_URL unset/empty when disabled", () => {
      const { error } = validate({ ...baseEnv, SQS_ENABLED: "false" });
      expect(error).toBeUndefined();
    });
  });

  describe("EZPAY_WEBHOOK_SECRET — conditional on verify-signature", () => {
    it("requires the secret when EZPAY_WEBHOOK_VERIFY_SIGNATURE=true", () => {
      const { error } = validate({
        ...baseEnv,
        EZPAY_WEBHOOK_VERIFY_SIGNATURE: "true",
      });
      expect(error?.message).toMatch(/EZPAY_WEBHOOK_SECRET/);
    });

    it("does not require the secret when verification is off", () => {
      const { error } = validate({
        ...baseEnv,
        EZPAY_WEBHOOK_VERIFY_SIGNATURE: "false",
      });
      expect(error).toBeUndefined();
    });
  });

  describe("numeric coercion + bounds", () => {
    it("coerces numeric strings and applies defaults", () => {
      const { value } = validate({ ...baseEnv });
      expect(value?.API_PORT).toBe(3001);
      expect(value?.DB_PORT).toBe(5432);
      expect(value?.WEBHOOK_TIMEOUT_MS).toBe(10000);
      expect(value?.UPLOAD_MAX_SIZE_BYTES).toBe(10485760);
      expect(value?.UPLOAD_PRESIGN_TTL_SECONDS).toBe(900);
      expect(value?.UPLOAD_READ_URL_TTL_SECONDS).toBe(604800);
    });

    it("coerces an overridden numeric string", () => {
      const { value } = validate({ ...baseEnv, API_PORT: "8080" });
      expect(value?.API_PORT).toBe(8080);
    });

    it("enforces WEBHOOK_TIMEOUT_MS min 1000", () => {
      const { error } = validate({ ...baseEnv, WEBHOOK_TIMEOUT_MS: "500" });
      expect(error?.message).toMatch(/WEBHOOK_TIMEOUT_MS/);
    });

    it("enforces UPLOAD_PRESIGN_TTL_SECONDS min 60", () => {
      const { error } = validate({
        ...baseEnv,
        UPLOAD_PRESIGN_TTL_SECONDS: "10",
      });
      expect(error?.message).toMatch(/UPLOAD_PRESIGN_TTL_SECONDS/);
    });

    it("rejects a blank port (Joi.number() parity — not coerced to 0)", () => {
      expect(validate({ ...baseEnv, API_PORT: "" }).error?.message).toMatch(
        /API_PORT/,
      );
      expect(validate({ ...baseEnv, DB_PORT: "  " }).error?.message).toMatch(
        /DB_PORT/,
      );
    });
  });

  describe("booleans", () => {
    it("defaults DB_SYNCHRONIZE / DB_LOGGING / SQS_ENABLED to false", () => {
      const { value } = validate({ ...baseEnv });
      expect(value?.DB_SYNCHRONIZE).toBe(false);
      expect(value?.DB_LOGGING).toBe(false);
      expect(value?.SQS_ENABLED).toBe(false);
    });

    it('parses the literal "true"/"false"', () => {
      const { value } = validate({ ...baseEnv, DB_SYNCHRONIZE: "true" });
      expect(value?.DB_SYNCHRONIZE).toBe(true);
    });

    it("rejects a non-boolean string", () => {
      const { error } = validate({ ...baseEnv, DB_SYNCHRONIZE: "yes" });
      expect(error?.message).toMatch(/DB_SYNCHRONIZE/);
    });
  });

  describe("string defaults", () => {
    it("defaults the SES + feedback recipients", () => {
      const { value } = validate({ ...baseEnv });
      expect(value?.SES_FROM_ADDRESS).toBe("noreply@gov.bb");
      expect(value?.SES_DEFAULT_RECIPIENT).toBe("testing@govtech.bb");
      expect(value?.FEEDBACK_RECIPIENT).toBe("feedback@govtech.bb");
    });

    it("honours an explicit SES_DEFAULT_RECIPIENT override", () => {
      const { value } = validate({
        ...baseEnv,
        SES_DEFAULT_RECIPIENT: "ops@gov.bb",
      });
      expect(value?.SES_DEFAULT_RECIPIENT).toBe("ops@gov.bb");
    });

    it("defaults the allow-empty token + URL vars to empty string", () => {
      const { value } = validate({ ...baseEnv });
      expect(value?.FORMS_BASE_URL).toBe("");
      expect(value?.WEBHOOK_URL).toBe("");
      expect(value?.S3_BUCKET).toBe("");
      expect(value?.RECIPE_PREVIEW_TOKEN).toBe("");
      expect(value?.SMOKE_SUBMISSION_TOKEN).toBe("");
    });
  });

  describe("allowUnknown parity (.passthrough)", () => {
    it("preserves unknown vars used by the config factories", () => {
      const { error, value } = validate({
        ...baseEnv,
        AWS_REGION: "ca-central-1",
        AWS_DEFAULT_REGION: "ca-central-1",
        SES_ENDPOINT: "http://localhost:8005",
      });
      expect(error).toBeUndefined();
      expect(value?.AWS_REGION).toBe("ca-central-1");
      expect(value?.SES_ENDPOINT).toBe("http://localhost:8005");
    });
  });
});

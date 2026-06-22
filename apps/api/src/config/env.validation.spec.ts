import { envValidationSchema } from "./env.validation";

const baseEnv = {
  DB_HOST: "localhost",
  DB_USERNAME: "postgres",
  DB_PASSWORD: "postgres",
  DB_NAME: "modular_forms",
  EZPAY_BASE_URL: "https://test.ezpay.gov.bb",
  EZPAY_DEPARTMENT_API_KEYS: "{}",
  ADMIN_API_TOKEN: "test-admin-token",
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

  describe("ADMIN_API_TOKEN — production guard (#286)", () => {
    it("requires ADMIN_API_TOKEN to be set in production", () => {
      const { ADMIN_API_TOKEN: _omit, ...envWithout } = baseEnv;
      const { error } = envValidationSchema.validate(
        {
          ...envWithout,
          NODE_ENV: "production",
          CORS_ORIGIN: "https://gov.bb",
        },
        { allowUnknown: true, abortEarly: false },
      );
      expect(error?.message).toMatch(/ADMIN_API_TOKEN/);
    });

    it("defaults ADMIN_API_TOKEN to empty outside production", () => {
      const { ADMIN_API_TOKEN: _omit, ...envWithout } = baseEnv;
      const { error, value } = envValidationSchema.validate(
        { ...envWithout, NODE_ENV: "development" },
        { allowUnknown: true, abortEarly: false },
      );
      expect(error).toBeUndefined();
      expect(value.ADMIN_API_TOKEN).toBe("");
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

import { envValidationSchema } from "./env.validation";

const baseEnv = {
  DB_HOST: "localhost",
  DB_USERNAME: "postgres",
  DB_PASSWORD: "postgres",
  DB_NAME: "modular_forms",
  EZPAY_BASE_URL: "https://test.ezpay.gov.bb",
  EZPAY_DEPARTMENT_API_KEYS: "{}",
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
          ADMIN_API_TOKEN: "a".repeat(32),
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

  describe("ADMIN_API_TOKEN — form-builder stopgap auth", () => {
    it("requires ADMIN_API_TOKEN when NODE_ENV=production", () => {
      const { error } = envValidationSchema.validate(
        { ...baseEnv, NODE_ENV: "production", CORS_ORIGIN: "https://gov.bb" },
        { allowUnknown: true, abortEarly: false },
      );
      expect(error?.message).toMatch(/ADMIN_API_TOKEN/);
    });

    it("accepts a 32+ char ADMIN_API_TOKEN in production", () => {
      const { error } = envValidationSchema.validate(
        {
          ...baseEnv,
          NODE_ENV: "production",
          CORS_ORIGIN: "https://gov.bb",
          ADMIN_API_TOKEN: "a".repeat(32),
        },
        { allowUnknown: true, abortEarly: false },
      );
      expect(error).toBeUndefined();
    });

    it("rejects a too-short ADMIN_API_TOKEN in production", () => {
      const { error } = envValidationSchema.validate(
        {
          ...baseEnv,
          NODE_ENV: "production",
          CORS_ORIGIN: "https://gov.bb",
          ADMIN_API_TOKEN: "a".repeat(10),
        },
        { allowUnknown: true, abortEarly: false },
      );
      expect(error?.message).toMatch(/ADMIN_API_TOKEN/);
      expect(error?.message).toMatch(/length must be at least 32/);
    });

    it("allows ADMIN_API_TOKEN to be unset in dev", () => {
      const { error } = envValidationSchema.validate(
        { ...baseEnv, NODE_ENV: "development" },
        { allowUnknown: true, abortEarly: false },
      );
      expect(error).toBeUndefined();
    });

    it("allows ADMIN_API_TOKEN to be empty string in dev", () => {
      const { error } = envValidationSchema.validate(
        { ...baseEnv, NODE_ENV: "development", ADMIN_API_TOKEN: "" },
        { allowUnknown: true, abortEarly: false },
      );
      expect(error).toBeUndefined();
    });
  });
});

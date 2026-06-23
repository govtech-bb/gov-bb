import { ConfigModule, ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { envValidationSchema } from "./env.validation";

// Integration smoke for the ConfigModule `validate:` wiring (app.module.ts).
// The unit spec covers the schema in isolation; this proves the NestJS contract
// end-to-end: a valid env boots (and the parsed result is written back to
// process.env), and an invalid env aborts module init — the fail-fast the
// boot-crash blast radius depends on. build/test never boots Nest otherwise.

const VALID_ENV = {
  DB_HOST: "localhost",
  DB_USERNAME: "postgres",
  DB_PASSWORD: "postgres",
  DB_NAME: "modular_forms",
  EZPAY_BASE_URL: "https://test.ezpay.gov.bb",
  EZPAY_DEPARTMENT_API_KEYS: "{}",
};

const bootConfigModule = () =>
  Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true, // use the seeded process.env, not apps/api/.env
        validate: (config) => envValidationSchema.parse(config),
      }),
    ],
  }).compile();

describe("ConfigModule env validation (boot)", () => {
  let saved: NodeJS.ProcessEnv;

  beforeEach(() => {
    saved = process.env;
    process.env = { ...VALID_ENV };
  });

  afterEach(() => {
    process.env = saved;
  });

  it("boots with a valid env and writes parsed defaults back to process.env", async () => {
    const moduleRef = await bootConfigModule();
    const config = moduleRef.get(ConfigService);
    // The transform default reaches process.env (assignVariablesToProcess).
    expect(process.env.CORS_ORIGIN).toBe("http://localhost:3000");
    expect(config.get("NODE_ENV")).toBe("development");
    await moduleRef.close();
  });

  it("fails to boot when the env is invalid (prod CORS wildcard)", async () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGIN = "*";
    await expect(bootConfigModule()).rejects.toThrow(/CORS_ORIGIN/);
  });
});

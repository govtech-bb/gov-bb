import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSslConfig,
  createDataSourceFromEnv,
  dbOptionsFromEnv,
} from "./data-source-env";
import { entities, migrations } from "./index";

const DB_ENV_KEYS = [
  "NODE_ENV",
  "DB_HOST",
  "DB_PORT",
  "DB_USERNAME",
  "DB_PASSWORD",
  "DB_NAME",
  "DB_SYNCHRONIZE",
  "DB_LOGGING",
  "DB_SSL_CA",
] as const;

describe("buildSslConfig", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of DB_ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of DB_ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("returns false outside production", () => {
    process.env.NODE_ENV = "development";
    expect(buildSslConfig()).toBe(false);
  });

  it("verifies the certificate in production with no CA configured", () => {
    process.env.NODE_ENV = "production";
    expect(buildSslConfig()).toEqual({ rejectUnauthorized: true });
  });

  it("uses DB_SSL_CA verbatim when it holds PEM contents", () => {
    process.env.NODE_ENV = "production";
    const pem = "-----BEGIN CERTIFICATE-----\nMIID\n-----END CERTIFICATE-----";
    process.env.DB_SSL_CA = pem;
    expect(buildSslConfig()).toEqual({ rejectUnauthorized: true, ca: pem });
  });

  it("reads DB_SSL_CA from disk when it holds a file path", () => {
    process.env.NODE_ENV = "production";
    const dir = mkdtempSync(join(tmpdir(), "db-ssl-ca-"));
    const file = join(dir, "rds-ca.pem");
    const pem =
      "-----BEGIN CERTIFICATE-----\nfromfile\n-----END CERTIFICATE-----";
    writeFileSync(file, pem, "utf8");
    process.env.DB_SSL_CA = file;
    try {
      expect(buildSslConfig()).toEqual({ rejectUnauthorized: true, ca: pem });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("dbOptionsFromEnv", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of DB_ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of DB_ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("applies dev-friendly defaults when env is unset", () => {
    expect(dbOptionsFromEnv()).toEqual({
      type: "postgres",
      host: "localhost",
      port: 5432,
      username: "postgres",
      password: "postgres",
      database: "modular_forms",
      synchronize: false,
      logging: false,
      ssl: false,
    });
  });

  it("reads connection values from the standard DB_* env vars", () => {
    process.env.DB_HOST = "db.example.com";
    process.env.DB_PORT = "6543";
    process.env.DB_USERNAME = "app";
    process.env.DB_PASSWORD = "secret";
    process.env.DB_NAME = "forms";
    process.env.DB_SYNCHRONIZE = "true";
    process.env.DB_LOGGING = "true";

    expect(dbOptionsFromEnv()).toEqual({
      type: "postgres",
      host: "db.example.com",
      port: 6543,
      username: "app",
      password: "secret",
      database: "forms",
      synchronize: true,
      logging: true,
      ssl: false,
    });
  });

  it("does not include entities or migrations", () => {
    const opts = dbOptionsFromEnv();
    expect(opts).not.toHaveProperty("entities");
    expect(opts).not.toHaveProperty("migrations");
  });

  it("merges overrides on top of the env-derived options", () => {
    process.env.DB_HOST = "db.example.com";
    const opts = dbOptionsFromEnv({ host: "override.example.com" });
    expect(opts.host).toBe("override.example.com");
  });
});

describe("createDataSourceFromEnv", () => {
  it("builds a DataSource carrying the package entities and migrations", () => {
    const ds = createDataSourceFromEnv();
    expect(ds.options.type).toBe("postgres");
    expect(ds.options.entities).toBe(entities);
    expect(ds.options.migrations).toBe(migrations);
  });
});

import pino from "pino";
import { describe, expect, it } from "vitest";
import type { DatabaseConfig } from "./config";
import { connect, createPool } from "./db";
import { Redacted } from "./modules/redacted";
import type { Result } from "./modules/result";

const config: DatabaseConfig = {
  host: "127.0.0.1",
  port: 1,
  user: "nobody",
  password: new Redacted("do-not-log-me"),
  database: "nothing",
  production: false,
};
function value<T, E extends Error>(result: Result<T, E>): T {
  if (!result.ok) throw result.error;
  return result.value;
}

describe("database setup", () => {
  it("reports an unreachable database using the explicit configuration", async () => {
    const pool = value(createPool(config, pino({ enabled: false })));
    try {
      const result = await connect(pool, config);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected failed connection");
      expect(result.error.message).toContain(
        "Cannot reach Postgres at 127.0.0.1:1 as nobody — refusing to start",
      );
      expect(result.error.message).not.toContain("do-not-log-me");
    } finally {
      await pool.end();
    }
  });

  it("logs idle connection failures without exposing the attached client", async () => {
    const lines: string[] = [];
    const logger = pino(
      {},
      {
        write: (chunk) => {
          lines.push(chunk);
        },
      },
    );
    const pool = value(createPool(config, logger));
    try {
      const error = Object.assign(
        new Error("terminating connection due to administrator command"),
        {
          code: "57P01",
          client: { password: "do-not-log-me" },
        },
      );
      expect(() => pool.emit("error", error)).not.toThrow();
      const recorded: unknown = JSON.parse(lines.join(""));
      expect(recorded).toMatchObject({
        code: "57P01",
        msg: "idle database connection dropped",
      });
      expect(lines.join("")).not.toContain("do-not-log-me");
      expect(lines.join("")).not.toContain("client");
      expect(lines.join("")).not.toContain("terminating connection");
    } finally {
      await pool.end();
    }
  });

  it("verifies production TLS and rejects unreadable CA files", async () => {
    const logger = pino({ enabled: false });
    const pool = value(createPool({ ...config, production: true }, logger));
    try {
      expect(pool.options.ssl).toEqual({ rejectUnauthorized: true });
    } finally {
      await pool.end();
    }
    const result = createPool(
      { ...config, production: true, ca: "/nonexistent/api-v2-ca.pem" },
      logger,
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      await result.value.end();
      throw new Error("Expected CA failure");
    }
    expect(result.error.operation).toBe("configure");
  });
});

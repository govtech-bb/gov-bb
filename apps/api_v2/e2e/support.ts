/**
 * The end-to-end harness: a scratch database, the built server as its own
 * process, and requests over a socket.
 *
 * Everything in `src/*.test.ts` runs through `app.inject` against Postgres,
 * which exercises the real router, the real handlers and real SQL. What it
 * cannot exercise is the process: whether `node dist/src/main.js` boots at
 * all, whether its own pool and migration run, and whether an unreachable
 * database is a loud non-zero exit rather than a server answering with empty
 * arrays. Those only show up when the thing actually runs, so this suite
 * runs it.
 *
 * It needs a Postgres and says so by skipping rather than failing when there
 * is not one: a red suite on a laptop with nothing running teaches people to
 * ignore red suites.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Client, Pool } from "pg";
import { createHmac, randomUUID } from "node:crypto";
import pino from "pino";
import { betterAuth } from "better-auth";
import { betterAuthOptions } from "../src/adapters/better-auth";
import { parseConfig } from "../src/config";

const root = join(__dirname, "..");

/** The suite is skipped unless a Postgres has been pointed at. */
export const HAS_DATABASE = Boolean(process.env.DB_HOST);

/** Connection settings for the scratch PostgreSQL test server. */
export const DB = {
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? "5432"),
  user: process.env.DB_USERNAME ?? "postgres",
  password: process.env.DB_PASSWORD ?? "postgres",
  /** The database every test connects through; created and dropped per run. */
  adminDatabase: process.env.DB_ADMIN_NAME ?? "postgres",
};

const admin = () => new Client({ ...DB, database: DB.adminDatabase });

/**
 * A database of its own, per run.
 *
 * #2700 is explicit that this connects to a fresh, empty Postgres and reads
 * or writes no existing table. A scratch database makes that true of the test
 * run as well, so pointing the suite at a developer's machine cannot touch
 * anything they already had.
 */
export async function createScratchDatabase(): Promise<string> {
  const name = `api_v2_e2e_${randomUUID().replaceAll("-", "")}`;
  const client = admin();
  await client.connect();
  await client.query(`create database ${name}`);
  await client.end();
  return name;
}

/**
 * Kills every client connection to a database, as a restart, failover or idle
 * reap would, and says how many it killed so a test can wait for that many
 * reactions.
 */
export async function terminateBackends(database: string): Promise<number> {
  const client = admin();
  await client.connect();
  const result = await client.query(
    `select pg_terminate_backend(pid) from pg_stat_activity
     where datname = $1 and backend_type = 'client backend'`,
    [database],
  );
  await client.end();
  return result.rowCount ?? 0;
}

/** Closed to new connections, a database refuses the pool's reconnect too. */
export async function allowConnections(
  database: string,
  allowed: boolean,
): Promise<void> {
  const client = admin();
  await client.connect();
  await client.query(`alter database ${database} allow_connections ${allowed}`);
  await client.end();
}

export async function dropScratchDatabase(name: string): Promise<void> {
  // Terminate anything still holding it, or the drop blocks on the pool the
  // server left behind and the suite hangs on teardown rather than failing.
  await terminateBackends(name);
  const client = admin();
  await client.connect();
  await client.query(`drop database if exists ${name}`);
  await client.end();
}

/** A real compiled application process, with observable shutdown. */
export interface Server {
  url: string;
  stderr: string;
  stop: (signal?: "SIGINT" | "SIGTERM") => Promise<number | null>;
}

/** Non-secret credentials used only with the isolated test database. */
export const AUTH_ENV = {
  NODE_ENV: "test",
  BETTER_AUTH_URL: "http://127.0.0.1:3020",
  EDITOR_ORIGIN: "http://localhost:3000",
  BETTER_AUTH_SECRET: "api-v2-test-secret-at-least-thirty-two-characters",
  GITHUB_CLIENT_ID: "api-v2-test-client",
  GITHUB_CLIENT_SECRET: "api-v2-test-client-secret",
};

const entrypoint = join(root, "dist", "src", "main.js");

/** Fail clearly when a process test has no compiled executable to exercise. */
export function assertBuilt(): void {
  if (!existsSync(entrypoint)) {
    throw new Error(
      `${entrypoint} does not exist — the e2e suite runs the built server. ` +
        `Run: pnpm exec nx run api_v2:build`,
    );
  }
}

/** Boots `node dist/src/main.js` and waits for it to answer, or gives up. */
export async function startServer(
  env: Record<string, string>,
  { waitForReady = true } = {},
): Promise<Server> {
  assertBuilt();
  const port = env.PORT ?? String(3120 + Math.floor(Math.random() * 500));
  const child: ChildProcess = spawn(process.execPath, [entrypoint], {
    cwd: root,
    env: {
      ...process.env,
      ...AUTH_ENV,
      BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
      DB_HOST: DB.host,
      DB_PORT: String(DB.port),
      DB_USERNAME: DB.user,
      DB_PASSWORD: DB.password,
      PORT: port,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const exited = new Promise<number | null>((resolve) =>
    child.once("exit", resolve),
  );
  const server: Server = {
    url: `http://127.0.0.1:${port}`,
    stderr: "",
    stop: async (signal = "SIGTERM") => {
      if (child.exitCode !== null || child.signalCode !== null)
        return child.exitCode;
      child.kill(signal);
      const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
      try {
        return await exited;
      } finally {
        clearTimeout(timer);
      }
    },
  };

  child.stderr?.on("data", (chunk) => {
    server.stderr += String(chunk);
  });
  child.stdout?.on("data", (chunk) => {
    server.stderr += String(chunk);
  });

  if (waitForReady) {
    try {
      await waitForHealthy(server, child);
    } catch (error) {
      await server.stop();
      throw error;
    }
  }
  return server;
}

async function waitForHealthy(server: Server, child: ChildProcess) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Server exited with ${child.exitCode} before serving:\n${server.stderr}`,
      );
    }
    try {
      const response = await fetch(`${server.url}/docs/openapi.json`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Server never became healthy:\n${server.stderr}`);
}

/** Runs a process to completion and hands back what it said and how it left. */
export async function runToExit(
  env: Record<string, string>,
): Promise<{ code: number | null; output: string }> {
  assertBuilt();
  const child = spawn(process.execPath, [entrypoint], {
    cwd: root,
    env: { ...process.env, ...AUTH_ENV, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout?.on("data", (chunk) => (output += String(chunk)));
  child.stderr?.on("data", (chunk) => (output += String(chunk)));

  const code = await new Promise<number | null>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(null);
    }, 30_000);
    child.once("exit", (exitCode) => {
      clearTimeout(timer);
      resolve(exitCode);
    });
  });

  return { code, output };
}

/** A database-backed BetterAuth session minted solely by this test harness. */
export interface EmployeeSession {
  cookie: string;
  userId: string;
  sessionId: string;
  token: string;
  expiresAt: Date;
}

/** Create a real library session; there is no corresponding HTTP bypass endpoint. */
export async function createEmployeeSession(
  database: string,
  apiOrigin: string,
  options: { expiresAt?: Date; email?: string; emailVerified?: boolean } = {},
): Promise<EmployeeSession> {
  const config = parseConfig({ ...AUTH_ENV, BETTER_AUTH_URL: apiOrigin });
  if (!config.ok) throw config.error;
  const pool = new Pool({ ...DB, database });
  try {
    const context = await betterAuth(
      betterAuthOptions(pool, config.value.auth, pino({ enabled: false })),
    ).$context;
    const userId = randomUUID();
    // The GitHub identity check is tested separately. Here the fixture inserts
    // a verified employee and asks BetterAuth itself to mint and store a session.
    await pool.query(
      'insert into auth_user (id, name, email, "emailVerified") values ($1, $2, $3, $4)',
      [
        userId,
        "API test employee",
        options.email ?? `${userId}@govtech.bb`,
        options.emailVerified ?? true,
      ],
    );
    const session = await context.internalAdapter.createSession(
      userId,
      false,
      options.expiresAt ? { expiresAt: options.expiresAt } : {},
      true,
    );
    if (!session) throw new Error("BetterAuth did not create the test session");
    const signature = createHmac("sha256", config.value.auth.secret.reveal())
      .update(session.token)
      .digest("base64");
    return {
      cookie: `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${signature}`)}`,
      userId,
      sessionId: session.id,
      token: session.token,
      expiresAt: session.expiresAt,
    };
  } finally {
    await pool.end();
  }
}

/** Execute a test assertion or mutation inside the suite's isolated database. */
export async function databaseQuery(
  database: string,
  sql: string,
  values: unknown[] = [],
): Promise<unknown[]> {
  if (!/^api_v2_e2e_[a-z0-9]+$/.test(database))
    throw new Error("Expected a scratch database name");
  const client = new Client({ ...DB, database });
  try {
    await client.connect();
    return (await client.query(sql, values)).rows;
  } finally {
    await client.end();
  }
}

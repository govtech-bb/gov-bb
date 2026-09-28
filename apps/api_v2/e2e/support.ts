/**
 * The end-to-end harness: a scratch database, the built server as its own
 * process, and requests over a socket.
 *
 * Everything in `src/*.test.ts` runs through `app.inject` against PGlite,
 * which is fast, needs nothing installed and exercises the real router, the
 * real handlers and real SQL. What it cannot exercise is the process: whether
 * `node dist/src/main.js` boots at all, whether the migration runs on a real
 * server, whether the node-postgres driver round-trips `timestamptz(3)` the
 * way WASM happened to, and whether an unreachable database is a loud non-zero
 * exit rather than a server answering with empty arrays. Those only show up
 * when the thing actually runs, so this suite runs it.
 *
 * It needs a Postgres and says so by skipping rather than failing when there
 * is not one: a red suite on a laptop with nothing running teaches people to
 * ignore red suites.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The suite is skipped unless a Postgres has been pointed at. */
export const HAS_DATABASE = Boolean(process.env.DB_HOST);

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
  const name = `api_v2_e2e_${Date.now().toString(36)}`;
  const client = admin();
  await client.connect();
  await client.query(`create database ${name}`);
  await client.end();
  return name;
}

export async function dropScratchDatabase(name: string): Promise<void> {
  const client = admin();
  await client.connect();
  // Terminate anything still holding it, or the drop blocks on the pool the
  // server left behind and the suite hangs on teardown rather than failing.
  await client.query(
    `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1`,
    [name],
  );
  await client.query(`drop database if exists ${name}`);
  await client.end();
}

export interface Server {
  url: string;
  stderr: string;
  stop: () => Promise<void>;
}

const entrypoint = join(root, "dist", "src", "main.js");

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
      DB_HOST: DB.host,
      DB_PORT: String(DB.port),
      DB_USERNAME: DB.user,
      DB_PASSWORD: DB.password,
      PORT: port,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const server: Server = {
    url: `http://127.0.0.1:${port}`,
    stderr: "",
    stop: async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    },
  };

  child.stderr?.on("data", (chunk) => {
    server.stderr += String(chunk);
  });
  child.stdout?.on("data", (chunk) => {
    server.stderr += String(chunk);
  });

  if (waitForReady) await waitForHealthy(server, child);
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
      const response = await fetch(`${server.url}/pages`);
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
    env: { ...process.env, ...env },
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

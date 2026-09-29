/**
 * The end-to-end harness: the built server as its own process, a throwaway
 * api_v2 behind it, and requests over a socket.
 *
 * The unit suite runs the page loaders as plain functions of an `ApiClient`,
 * which proves what they throw but not what a citizen receives. The status
 * is decided further out — by `setResponseStatus`, by Start answering a
 * server-rendered page with the router's status, and by the root route's
 * middleware putting the 503 back — and only a built server runs all of
 * that the way production does. So this suite builds one and asks it.
 *
 * It needs no Postgres and no real api_v2: the throwaway one answers from a
 * table, so every status the page can take is one request away.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// The `node-server` build, not the Amplify one: Nitro's `aws_amplify`
// runtime always listens on :3000 and ignores PORT (see vite.config.ts).
const entrypoint = join(root, ".output", "server", "index.mjs");

export type ApiRoute = { status: number; body?: unknown };

/**
 * A throwaway api_v2 answering from a function of path → response, and 404
 * for anything it has no answer for.
 *
 * It sends no `Cache-Control`, so landing_v2's HTTP cache stores nothing it
 * answers and every request reaches it: a 5xx here can never be covered by a
 * stale copy of an earlier 200.
 */
export async function startApi(routes: (path: string) => ApiRoute | undefined) {
  const server = createServer((req, res) => {
    const route = routes(req.url ?? "") ?? { status: 404 };
    res.statusCode = route.status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(route.body ?? { error: route.status }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return { baseUrl: `http://127.0.0.1:${port}`, close };
}

/**
 * A port that was listened on and then closed, so nothing is on it.
 *
 * For the server's own port, and for an api_v2 that cannot be reached. Not
 * `127.0.0.1:1`: undici refuses a fetch to port 1 outright as a blocked port,
 * which is a different failure from the refused connection a down api_v2 is.
 */
export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

export interface LandingServer {
  url: string;
  /** Everything the server has written to stdout and stderr so far. */
  output: string;
  stop: () => Promise<void>;
}

/** Boots the built server against `apiUrl` and waits for it to answer. */
export async function startServer({
  apiUrl,
}: {
  apiUrl: string;
}): Promise<LandingServer> {
  if (!existsSync(entrypoint)) {
    throw new Error(
      `${entrypoint} does not exist — the e2e suite runs the built server. ` +
        `Run: pnpm exec nx run landing_v2:build-e2e`,
    );
  }
  const host = "127.0.0.1";
  const port = await freePort();
  const child: ChildProcess = spawn(process.execPath, [entrypoint], {
    cwd: root,
    env: {
      ...process.env,
      // Nitro reads `NITRO_PORT ?? PORT`, so a NITRO_PORT in the shell would
      // beat a PORT set here. Loopback only, where `url` points.
      NITRO_PORT: String(port),
      NITRO_HOST: host,
      // Nitro's runtime overrides of the `apiV2Url` and `formsUrl` baked in
      // at build time. FORMS_URL is set because a built server without it
      // fails every request with a 500, which would mask every case here.
      NITRO_API_V2_URL: apiUrl,
      NITRO_FORMS_URL: "http://forms.example",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const server: LandingServer = {
    url: `http://${host}:${port}`,
    output: "",
    stop: async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      // A child that ignores SIGTERM would otherwise outlive the suite, or
      // hold `afterAll` until its hook times out.
      const kill = setTimeout(() => child.kill("SIGKILL"), 5_000);
      await exited;
      clearTimeout(kill);
    },
  };
  child.stdout?.on("data", (chunk) => (server.output += String(chunk)));
  child.stderr?.on("data", (chunk) => (server.output += String(chunk)));

  await waitForListening(server, child);
  return server;
}

/**
 * Waits until `GET /` answers with any status at all.
 *
 * Not for a 2xx: the index reads api_v2's `/pages`, which a spec may answer
 * with a 500, and then `/` is a 503 however long it waits.
 */
async function waitForListening(server: LandingServer, child: ChildProcess) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Server exited with ${child.exitCode ?? child.signalCode} before ` +
          `serving:\n${server.output}`,
      );
    }
    try {
      // A server that accepts the connection and never answers would
      // otherwise hold this fetch past the deadline.
      const response = await fetch(server.url, {
        signal: AbortSignal.timeout(2_000),
      });
      await response.body?.cancel();
      return;
    } catch {
      // Not listening yet, or not answering yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await server.stop();
  throw new Error(`Server never answered:\n${server.output}`);
}

/**
 * The id Start's compiler gives a server function in `src/server/pages.ts`
 * in a build.
 *
 * The compiler hashes `${filename}--${functionName}`, which reads as the
 * file's absolute path and the export's name, and a hash of that is not an
 * id the built server knows. The build's own manifest
 * (`.output/server/_ssr/ssr.mjs`) says what the two really are: the path
 * from the app root, and the name of the handler the compiler extracts,
 * `<name>_createServerFn_handler`. So the id is the same in every checkout.
 */
export function serverFnId(name: string): string {
  return createHash("sha256")
    .update(`src/server/pages.ts--${name}_createServerFn_handler`)
    .digest("hex");
}

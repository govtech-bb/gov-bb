/**
 * Migrates the template database the tests clone, once per run.
 *
 * The template's pool is closed before any test starts: Postgres refuses to
 * clone a database something is still connected to.
 */

import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { TestProject } from "vitest/node";
import { migrate } from "./migrate";
import { adminQuery, runPrefix, TEST_SERVER } from "./test-db";

export default async function setup(project: TestProject) {
  const prefix = runPrefix(randomUUID().replaceAll("-", "").slice(0, 8));
  const template = `${prefix}template`;
  try {
    await adminQuery(`create database ${template}`);
  } catch (cause) {
    throw new Error(
      `api_v2's tests need Postgres at ${TEST_SERVER.host}:${TEST_SERVER.port} ` +
        `as ${TEST_SERVER.user}. Start one, or set DB_HOST, DB_PORT, ` +
        "DB_USERNAME and DB_PASSWORD.",
      { cause },
    );
  }
  const pool = new Pool({ ...TEST_SERVER, database: template });
  try {
    await migrate(drizzle(pool), (script) => pool.query(script));
  } catch (error) {
    await pool.end();
    await adminQuery(`drop database if exists ${template} with (force)`);
    throw error;
  }
  await pool.end();
  project.provide("templateDatabase", template);

  return async () => {
    const leftovers = (await adminQuery(
      `select datname from pg_database where datname like '${prefix}%'`,
    )) as Array<{ datname: string }>;
    for (const { datname } of leftovers) {
      await adminQuery(`drop database if exists ${datname} with (force)`);
    }
  };
}

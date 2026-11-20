/**
 * After `import-collections` (#3783), compares an environment's data
 * collections with the seed through the public `GET /collections/:key/records`
 * and names each difference: a missing collection or record, a record whose
 * data differs, a field list that differs. Records the seed does not have are
 * editors' and are not differences.
 *
 * `tsx scripts/check-collections.ts --base-url <api_v2>`
 */

import { parseArgs } from "node:util";
import { z } from "zod";
import {
  compareCollection,
  describeDifference,
  parseSeedCollection,
  type StoredCollection,
} from "../src/collection-import";
import { CollectionRecord, CollectionView } from "../src/modules/collection";
import { COLLECTIONS } from "../src/seed-data/collections";

class Stop extends Error {}

const Stored = z.object({
  collection: CollectionView,
  records: z.array(CollectionRecord),
});

async function main() {
  const { values } = parseArgs({
    options: { "base-url": { type: "string" } },
  });
  const baseUrl = values["base-url"]?.replace(/\/+$/, "");
  if (!baseUrl) throw new Stop("--base-url <api_v2 origin> is required");

  let differences = 0;
  for (const seed of COLLECTIONS.map(parseSeedCollection)) {
    const key = seed.definition.key;
    const found = compareCollection(seed, await read(baseUrl, key));
    for (const difference of found) console.log(describeDifference(difference));
    differences += found.length;
  }
  console.log(
    `${differences} differences in ${COLLECTIONS.length} seed collections`,
  );
  process.exitCode = differences ? 1 : 0;
}

/** One collection as the API serves it, or null when it has none by `key`. */
async function read(
  baseUrl: string,
  key: string,
): Promise<StoredCollection | null> {
  const url = `${baseUrl}/collections/${encodeURIComponent(key)}/records`;
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    const { message, cause } = error as Error;
    const why = cause instanceof Error ? ` (${cause.message})` : "";
    throw new Stop(`${url}: ${message}${why}`);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new Stop(`${url}: HTTP ${response.status}`);
  const body = Stored.safeParse(await response.json().catch(() => undefined));
  if (!body.success) throw new Stop(`${url}: not a collection and its records`);
  return body.data;
}

main().catch((error: unknown) => {
  console.error(error instanceof Stop ? error.message : error);
  process.exitCode = 1;
});

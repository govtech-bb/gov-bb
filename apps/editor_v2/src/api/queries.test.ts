import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import type { EstateVersion } from "./client";
import { versionQuery } from "./queries";

test("refreshes content reads only when the estate's version moves", async () => {
  const client = new QueryClient();
  let version: EstateVersion = { count: 1, latest: "2026-10-07T12:00:00.000Z" };
  const query = versionQuery({ version: async () => version }, client);
  const services = ["content", "services"];

  const invalidated = () => client.getQueryState(services)?.isInvalidated;

  client.setQueryData(services, []);
  await client.fetchQuery(query);
  await client.fetchQuery(query);
  expect(invalidated()).toBe(false);

  version = { count: 2, latest: "2026-10-07T12:01:00.000Z" };
  await client.fetchQuery(query);
  expect(invalidated()).toBe(true);
});

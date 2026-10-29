import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import {
  ApiFailure,
  CategoryAccessDenied,
  CategoryAnswerMalformed,
  CategoryRefused,
  CategoryUnreachable,
  type EstateVersion,
} from "./client";
import { estateVersionQuery, retryContentRead } from "./queries";

test("asks a failed read again only while asking could answer differently", () => {
  // Unreachable, or failing on the API's side: up to three times
  for (const error of [new CategoryUnreachable(), new CategoryRefused(503), new ApiFailure(0)]) {
    expect(retryContentRead(0, error)).toBe(true);
    expect(retryContentRead(2, error)).toBe(true);
    expect(retryContentRead(3, error)).toBe(false);
  }

  // A refusal, or a list that isn't one, answers the same way every time
  expect(retryContentRead(0, new CategoryAccessDenied(401, "Sign in."))).toBe(false);
  expect(retryContentRead(0, new ApiFailure(404))).toBe(false);
  expect(retryContentRead(0, new CategoryAnswerMalformed())).toBe(false);
});

test("refreshes content reads only when the estate's version moves", async () => {
  const client = new QueryClient();
  let version: EstateVersion = { count: 1, latest: "2026-10-07T12:00:00.000Z" };
  const query = estateVersionQuery({ version: async () => version }, client);
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

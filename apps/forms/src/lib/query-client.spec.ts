/**
 * query-client.spec.ts
 *
 * Unit tests for the application-wide QueryClient singleton.
 *
 * Coverage:
 *  - queryClient is an instance of QueryClient
 *  - defaultOptions.queries.staleTime === 60_000
 *  - defaultOptions.queries.gcTime === 5 * 60_000
 *  - defaultOptions.queries.retry === 1
 *  - defaultOptions.queries.refetchOnWindowFocus === false
 */

import { QueryClient } from "@tanstack/react-query";
import { queryClient } from "./query-client";

describe("queryClient", () => {
  it("is an instance of QueryClient", () => {
    expect(queryClient).toBeInstanceOf(QueryClient);
  });

  it("has staleTime set to 60 000 ms", () => {
    expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(60_000);
  });

  it("has gcTime set to 5 minutes (300 000 ms)", () => {
    expect(queryClient.getDefaultOptions().queries?.gcTime).toBe(5 * 60_000);
  });

  it("has retry set to 1", () => {
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(1);
  });

  it("has refetchOnWindowFocus set to false", () => {
    expect(queryClient.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(
      false,
    );
  });
});

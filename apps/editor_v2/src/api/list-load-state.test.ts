import { expect, test } from "vitest";
import { ApiAnswerMalformed, ApiFailure, CategoryAnswerMalformed } from "./client";
import { listLoadState, type ListLoadState } from "./list-load-state";

const cases: {
  name: string;
  data: string[] | undefined;
  isError: boolean;
  error: Error | null;
  expected: ListLoadState;
}[] = [
  {
    name: "first read",
    data: undefined,
    isError: false,
    error: null,
    expected: { kind: "loading" },
  },
  { name: "loaded", data: ["row"], isError: false, error: null, expected: { kind: "shown" } },
  { name: "loaded empty", data: [], isError: false, error: null, expected: { kind: "shown" } },
];

for (const data of [undefined, [], ["row"]]) {
  for (const [status, reason] of [
    [401, "session-ended"],
    [403, "no-access"],
    [404, "gone"],
  ] as const) {
    cases.push({
      name: `${status} with ${data?.length ?? "no"} loaded rows`,
      data,
      isError: true,
      error: new ApiFailure(status),
      expected: { kind: "blocked", reason },
    });
  }

  for (const error of [
    new ApiFailure(0),
    new ApiFailure(400),
    new ApiFailure(409),
    new ApiFailure(422),
    new ApiFailure(429),
    new ApiFailure(500),
    new ApiFailure(503),
    new ApiAnswerMalformed(),
    new CategoryAnswerMalformed(),
    new TypeError("Offline"),
  ]) {
    cases.push({
      name: `${error.message} with ${data?.length ?? "no"} loaded rows`,
      data,
      isError: true,
      error,
      expected:
        data === undefined
          ? { kind: "blocked", reason: "unreachable" }
          : { kind: "refresh-failed" },
    });
  }
}

test.each(cases)("$name", ({ data, isError, error, expected }) => {
  expect(listLoadState({ data, isError, error })).toEqual(expected);
});

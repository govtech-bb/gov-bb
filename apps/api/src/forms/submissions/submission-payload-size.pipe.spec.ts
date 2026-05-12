import { PayloadTooLargeException } from "@nestjs/common";
import {
  SubmissionPayloadSizePipe,
  MAX_VALUES_BYTES,
} from "./submission-payload-size.pipe";

describe("SubmissionPayloadSizePipe", () => {
  const pipe = new SubmissionPayloadSizePipe();

  it("passes a small payload through unchanged", () => {
    const body = { formId: "f", values: { s: { a: "b" } } };
    expect(pipe.transform(body)).toBe(body);
  });

  it("throws PayloadTooLargeException when stringified body exceeds 1 MiB", () => {
    const big = "x".repeat(MAX_VALUES_BYTES + 1);
    const body = { formId: "f", values: { s: { a: big } } };
    expect(() => pipe.transform(body)).toThrow(PayloadTooLargeException);
  });
});

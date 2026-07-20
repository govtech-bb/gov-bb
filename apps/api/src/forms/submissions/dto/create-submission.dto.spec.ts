import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { CreateSubmissionDto } from "./create-submission.dto";

function buildDto(values: unknown): CreateSubmissionDto {
  return plainToInstance(CreateSubmissionDto, {
    formId: "f",
    formVersion: "1.0.0",
    values,
  });
}

describe("CreateSubmissionDto — values shape", () => {
  it("accepts a non-repeatable + repeatable mixed payload", () => {
    const errs = validateSync(buildDto({ s: { a: "b" }, jobs: [{ e: "x" }] }));
    expect(errs).toEqual([]);
  });

  it("rejects > 500 instances in one step", () => {
    const big = Array.from({ length: 501 }, () => ({ e: "x" }));
    const errs = validateSync(buildDto({ jobs: big }));
    expect(errs).not.toEqual([]);
  });

  it("rejects > 2000 total instances", () => {
    const v: Record<string, Array<Record<string, unknown>>> = {};
    for (let i = 0; i < 5; i++) {
      v[`step-${i}`] = Array.from({ length: 401 }, () => ({ e: "x" }));
    }
    const errs = validateSync(buildDto(v));
    expect(errs).not.toEqual([]);
  });

  it("rejects nested arrays as instance", () => {
    const errs = validateSync(buildDto({ jobs: [[{ e: "x" }]] }));
    expect(errs).not.toEqual([]);
  });

  it("rejects a non-object/non-array step value", () => {
    const errs = validateSync(buildDto({ s: "string" }));
    expect(errs).not.toEqual([]);
  });

  it("accepts a payload omitting formVersion (#1196 — version retired)", () => {
    const dto = plainToInstance(CreateSubmissionDto, {
      formId: "f",
      values: { s: { a: "b" } },
    });
    expect(validateSync(dto)).toEqual([]);
  });

  it("rejects a present-but-malformed formVersion", () => {
    const dto = plainToInstance(CreateSubmissionDto, {
      formId: "f",
      formVersion: "not-a-version",
      values: { s: { a: "b" } },
    });
    expect(validateSync(dto)).not.toEqual([]);
  });
});

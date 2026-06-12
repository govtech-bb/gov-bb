import { ConfigService } from "@nestjs/config";
import * as ExcelJS from "exceljs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SpreadsheetProcessor } from "./spreadsheet.processor";
import type { SubmissionCreatedEvent } from "../submissions.types";

// NOTE: this file deliberately does NOT `jest.mock("exceljs")`. It exercises the
// real read-modify-write against a real workbook on disk, so it proves the
// per-path serializer against actual file I/O — the lost-update race a mock
// can't faithfully reproduce. (The main spec keeps the global ExcelJS mock; jest
// runs each spec file in its own module registry, so the two don't collide.)

function makeConfig(exportDir: string): ConfigService {
  return {
    get: (key: string) =>
      key === "spreadsheet.exportDir" ? exportDir : undefined,
  } as unknown as ConfigService;
}

function makePayload(submissionId: string): SubmissionCreatedEvent {
  return {
    submissionId,
    referenceCode: `PPT-${submissionId}`,
    formId: "passport-renewal",
    formVersion: "1.0.0",
    idempotencyKey: `idem-${submissionId}`,
    processors: [{ type: "spreadsheet", config: { filename: "shared" } }],
    values: { personal: { firstName: "Jane", surname: "Doe" } },
    meta: {
      schemaVersion: 1,
      pinnedFormVersion: "1.0.0",
      draftId: `draft-${submissionId}`,
      activeStepIds: ["personal"],
      hiddenStepIds: [],
      activeFieldIds: { personal: ["firstName", "surname"] },
      hiddenFieldIds: {},
      visitedPages: [0],
      submittedAt: "2026-04-29T10:00:00.000Z",
    },
  };
}

describe("SpreadsheetProcessor — concurrent appends (real ExcelJS)", () => {
  let exportDir: string;
  let processor: SpreadsheetProcessor;

  beforeEach(() => {
    exportDir = mkdtempSync(join(tmpdir(), "ss-concurrency-"));
    processor = new SpreadsheetProcessor(makeConfig(exportDir));
  });

  afterEach(() => {
    rmSync(exportDir, { recursive: true, force: true });
  });

  it("lands both rows when two submissions append to the same file concurrently", async () => {
    // Without the serializer both writers readFile (file absent) before either
    // writeFile, then the second write clobbers the first — a lost row.
    await Promise.all([
      processor.process(makePayload("sub-A")),
      processor.process(makePayload("sub-B")),
    ]);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(join(exportDir, "shared.xlsx"));
    const sheet = workbook.getWorksheet("Submissions");
    expect(sheet).toBeDefined();

    const refs: unknown[] = [];
    sheet!.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header
      refs.push(row.getCell(1).value);
    });

    expect(refs).toContain("sub-A:0");
    expect(refs).toContain("sub-B:0");
    expect(refs).toHaveLength(2);
  });
});

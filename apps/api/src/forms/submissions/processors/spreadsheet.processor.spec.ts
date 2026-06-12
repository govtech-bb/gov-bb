import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as ExcelJS from "exceljs";
import * as fs from "node:fs";
import { join } from "node:path";
import { SpreadsheetProcessor } from "./spreadsheet.processor";
import type { SubmissionCreatedEvent } from "../submissions.types";

jest.mock("exceljs");
jest.mock("node:fs", () => ({
  ...jest.requireActual("node:fs"),
  mkdirSync: jest.fn(),
}));

function makeConfig(exportDir = "/tmp/test-exports"): ConfigService {
  return {
    get: (key: string) =>
      key === "spreadsheet.exportDir" ? exportDir : undefined,
  } as unknown as ConfigService;
}

function makePayload(
  submissionId = "sub-003",
  processorConfig: Record<string, string> = {},
): SubmissionCreatedEvent {
  return {
    submissionId,
    referenceCode: "PPT-20260604-130732-000003",
    formId: "passport-renewal",
    formVersion: "1.0.0",
    idempotencyKey: "idem-spreadsheet-1",
    processors: [
      {
        type: "spreadsheet",
        config: { filename: "passport-renewals", ...processorConfig },
      },
    ],
    values: { personal: { firstName: "Jane", surname: "Doe" } },
    meta: {
      schemaVersion: 1,
      pinnedFormVersion: "1.0.0",
      draftId: "draft-003",
      activeStepIds: ["personal"],
      hiddenStepIds: [],
      activeFieldIds: { personal: ["firstName", "surname"] },
      hiddenFieldIds: {},
      visitedPages: [0],
      submittedAt: "2026-04-29T10:00:00.000Z",
    },
  };
}

/** Builds a mock ExcelJS.Workbook where `getWorksheet` returns an existing sheet with given rows. */
function buildWorkbookMock(existingRows: string[][] = []) {
  const rows = existingRows.map((cells) => ({
    getCell: (col: number) => ({ value: cells[col - 1] }),
  }));

  const sheet = {
    rowCount: rows.length,
    getRow: (r: number) => rows[r - 1] ?? { getCell: () => ({ value: null }) },
    addRow: jest.fn(),
  };

  const workbook = {
    getWorksheet: jest.fn().mockReturnValue(sheet),
    addWorksheet: jest.fn().mockReturnValue(sheet),
    xlsx: {
      readFile: jest.fn().mockResolvedValue(undefined),
      writeFile: jest.fn().mockResolvedValue(undefined),
    },
  };

  (ExcelJS.Workbook as jest.Mock).mockImplementation(() => workbook);

  return { workbook, sheet };
}

describe("SpreadsheetProcessor", () => {
  let processor: SpreadsheetProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new SpreadsheetProcessor(makeConfig());
  });

  describe("process", () => {
    it("creates the export directory when it does not exist", async () => {
      buildWorkbookMock();
      await processor.process(makePayload());

      expect(fs.mkdirSync).toHaveBeenCalledWith("/tmp/test-exports", {
        recursive: true,
      });
    });

    it("writes a header row and a data row for the first submission", async () => {
      const { sheet } = buildWorkbookMock(); // no existing rows → isNew = false but sheet returned
      // Simulate a brand-new sheet (no getWorksheet result)
      const workbook = {
        getWorksheet: jest.fn().mockReturnValue(undefined),
        addWorksheet: jest.fn().mockReturnValue(sheet),
        xlsx: {
          readFile: jest.fn().mockRejectedValue(new Error("ENOENT")),
          writeFile: jest.fn().mockResolvedValue(undefined),
        },
      };
      (ExcelJS.Workbook as jest.Mock).mockImplementation(() => workbook);

      await processor.process(makePayload());

      // First addRow call = headers, second = data
      expect(sheet.addRow).toHaveBeenCalledTimes(2);
      const [headerRow] = sheet.addRow.mock.calls;
      expect(headerRow[0]).toContain("submissionId");
    });

    it("appends a data row to an existing sheet without re-writing headers", async () => {
      // Existing sheet already has a header row + one data row with a different ID
      const { sheet } = buildWorkbookMock([
        ["submissionId", "formId"],
        ["sub-999", "passport-renewal"],
      ]);

      await processor.process(makePayload("sub-003"));

      expect(sheet.addRow).toHaveBeenCalledTimes(1);
      const [dataRow] = sheet.addRow.mock.calls;
      // Column 1 is the composite dedup token `${submissionId}:${index}`.
      expect(dataRow[0][0]).toBe("sub-003:0");
    });

    it("uses the formId as filename when no filename is configured", async () => {
      const { workbook } = buildWorkbookMock();
      const payload = makePayload();
      payload.processors = [{ type: "spreadsheet", config: {} }];

      await processor.process(payload);

      expect(workbook.xlsx.writeFile).toHaveBeenCalledWith(
        expect.stringContaining("passport-renewal.xlsx"),
      );
    });

    it("skips writing and warns when this entry's composite token already exists (retry safety)", async () => {
      const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();

      // The sheet already holds this entry's composite token — a retry.
      const { workbook } = buildWorkbookMock([
        ["submissionRef", "submissionId"],
        ["sub-003:0", "sub-003"],
      ]);

      await processor.process(makePayload("sub-003"));

      expect(workbook.xlsx.writeFile).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("already recorded"),
      );
      warn.mockRestore();
    });

    it("does not falsely dedup a sibling entry sharing the same file (composite token is per-entry)", async () => {
      // Sheet already holds entry 0's row. Entry 1 writes to the same file and
      // must NOT mistake entry 0's row for its own — each entry dedups on its
      // own `${submissionId}:${index}` token. This is the load-bearing fix.
      const { sheet, workbook } = buildWorkbookMock([
        ["submissionRef", "submissionId"],
        ["sub-003:0", "sub-003"],
      ]);

      const payload = makePayload("sub-003");
      payload.processors = [
        { type: "spreadsheet", config: { filename: "shared" } },
        { type: "spreadsheet", config: { filename: "shared" } },
      ];
      payload.processorIndex = 1;

      await processor.process(payload);

      expect(sheet.addRow).toHaveBeenCalledTimes(1);
      expect((sheet.addRow.mock.calls[0][0] as string[])[0]).toBe("sub-003:1");
      expect(workbook.xlsx.writeFile).toHaveBeenCalled();
    });

    it("flattens step-scoped values into stepId.fieldId columns", async () => {
      const { sheet } = buildWorkbookMock();
      const workbook = {
        getWorksheet: jest.fn().mockReturnValue(undefined),
        addWorksheet: jest.fn().mockReturnValue(sheet),
        xlsx: {
          readFile: jest.fn().mockRejectedValue(new Error("ENOENT")),
          writeFile: jest.fn().mockResolvedValue(undefined),
        },
      };
      (ExcelJS.Workbook as jest.Mock).mockImplementation(() => workbook);

      await processor.process(makePayload());

      const [headerRow] = sheet.addRow.mock.calls;
      expect(headerRow[0]).toContain("personal.firstName");
      expect(headerRow[0]).toContain("personal.surname");
    });

    it("uses cwd/exports as exportDir when config returns undefined", () => {
      // Branch: `config.get(...) ?? join(process.cwd(), "exports")`
      const configWithoutDir = {
        get: (_key: string) => undefined,
      } as unknown as ConfigService;
      const proc = new SpreadsheetProcessor(configWithoutDir);
      // The processor was constructed without throwing — verify it uses cwd fallback
      // by checking the exportDir is not the test-specific "/tmp/test-exports"
      expect(proc).toBeInstanceOf(SpreadsheetProcessor);
      expect((proc as any).exportDir).toBe(join(process.cwd(), "exports"));
    });

    it("is a no-op when no entry exists at processorIndex (defensive guard)", async () => {
      // Per-entry dispatch never invokes the handler without a matching entry,
      // but guard against a corrupted/out-of-range index rather than throwing.
      const { workbook } = buildWorkbookMock();
      const payload = makePayload();
      payload.processors = [];

      const result = await processor.process(payload);

      expect(result).toEqual({ kind: "completed" });
      expect(workbook.xlsx.writeFile).not.toHaveBeenCalled();
      expect(workbook.addWorksheet).not.toHaveBeenCalled();
    });

    it("strips path-traversal segments from a recipe-supplied filename (#297)", async () => {
      const { workbook } = buildWorkbookMock();

      await processor.process(
        makePayload("sub-003", { filename: "../../etc/passwd" }),
      );

      expect(workbook.xlsx.writeFile).toHaveBeenCalledWith(
        join("/tmp/test-exports", "passwd.xlsx"),
      );
      const writtenPath = (workbook.xlsx.writeFile as jest.Mock).mock
        .calls[0][0] as string;
      expect(writtenPath).not.toContain("..");
    });

    it("serializes concurrent appends to the same file (critical section never overlaps)", async () => {
      // Two submissions append to the SAME file concurrently. The per-path lock
      // must keep their read-modify-write sections from interleaving, so an
      // "active" counter never exceeds 1 and both rows are added.
      let active = 0;
      let maxActive = 0;
      let addRowCount = 0;
      const delay = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));

      (ExcelJS.Workbook as jest.Mock).mockImplementation(() => {
        const sheet = {
          rowCount: 0,
          getRow: () => ({ getCell: () => ({ value: null }) }),
          addRow: jest.fn(() => {
            addRowCount++;
          }),
        };
        return {
          getWorksheet: jest.fn().mockReturnValue(undefined),
          addWorksheet: jest.fn().mockReturnValue(sheet),
          xlsx: {
            readFile: jest.fn().mockImplementation(async () => {
              active++;
              maxActive = Math.max(maxActive, active);
              await delay(10);
            }),
            writeFile: jest.fn().mockImplementation(async () => {
              await delay(10);
              active--;
            }),
          },
        };
      });

      // Both use the default "passport-renewals" filename → same resolved path.
      await Promise.all([
        processor.process(makePayload("sub-A")),
        processor.process(makePayload("sub-B")),
      ]);

      expect(maxActive).toBe(1);
      // Each fresh sheet writes a header + a data row → 2 rows per call.
      expect(addRowCount).toBe(4);
    });

    it("isolates a failed turn: the next queued turn for the same file still runs", async () => {
      // A turn that throws must propagate to ITS caller (so the consumer NACKs)
      // but must not break the chain — the next waiter for the same file runs.
      let writeCount = 0;

      (ExcelJS.Workbook as jest.Mock).mockImplementation(() => {
        const sheet = {
          rowCount: 0,
          getRow: () => ({ getCell: () => ({ value: null }) }),
          addRow: jest.fn(),
        };
        return {
          getWorksheet: jest.fn().mockReturnValue(undefined),
          addWorksheet: jest.fn().mockReturnValue(sheet),
          xlsx: {
            readFile: jest.fn().mockRejectedValue(new Error("ENOENT")),
            writeFile: jest.fn().mockImplementation(async () => {
              writeCount++;
              if (writeCount === 1) throw new Error("disk full");
            }),
          },
        };
      });

      // p1 acquires the lock first and its write throws; p2 is queued behind it.
      const p1 = processor.process(makePayload("sub-A"));
      const p2 = processor.process(makePayload("sub-B"));

      await expect(p1).rejects.toThrow("disk full");
      await expect(p2).resolves.toEqual({ kind: "completed" });
      expect(writeCount).toBe(2);
    });

    it("does not serialize appends to different files (distinct paths stay parallel)", async () => {
      // Two concurrent appends to DIFFERENT files must overlap — the per-path
      // lock only serializes calls that resolve to the same file.
      let active = 0;
      let maxActive = 0;
      const delay = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));

      (ExcelJS.Workbook as jest.Mock).mockImplementation(() => {
        const sheet = {
          rowCount: 0,
          getRow: () => ({ getCell: () => ({ value: null }) }),
          addRow: jest.fn(),
        };
        return {
          getWorksheet: jest.fn().mockReturnValue(undefined),
          addWorksheet: jest.fn().mockReturnValue(sheet),
          xlsx: {
            readFile: jest.fn().mockImplementation(async () => {
              active++;
              maxActive = Math.max(maxActive, active);
              await delay(10);
            }),
            writeFile: jest.fn().mockImplementation(async () => {
              await delay(10);
              active--;
            }),
          },
        };
      });

      await Promise.all([
        processor.process(makePayload("sub-A", { filename: "file-one" })),
        processor.process(makePayload("sub-B", { filename: "file-two" })),
      ]);

      // Different files → both critical sections run at once.
      expect(maxActive).toBe(2);
    });

    it("skips repeatable/array-valued steps when flattening values", async () => {
      // Branch: `if (Array.isArray(fields)) continue`
      const { sheet } = buildWorkbookMock();
      const workbook = {
        getWorksheet: jest.fn().mockReturnValue(undefined),
        addWorksheet: jest.fn().mockReturnValue(sheet),
        xlsx: {
          readFile: jest.fn().mockRejectedValue(new Error("ENOENT")),
          writeFile: jest.fn().mockResolvedValue(undefined),
        },
      };
      (ExcelJS.Workbook as jest.Mock).mockImplementation(() => workbook);

      const payload = makePayload();
      // Add an array-valued step to trigger the Array.isArray branch
      payload.values = {
        personal: { firstName: "Jane", surname: "Doe" },
        "repeatable-step": [{ entry: "1" }, { entry: "2" }] as any,
      };

      await processor.process(payload);

      // Headers should only contain personal.* columns, not repeatable-step.*
      const [headerRow] = sheet.addRow.mock.calls;
      expect(headerRow[0]).toContain("personal.firstName");
      expect(headerRow[0]).not.toContain("repeatable-step");
    });
  });
});

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
      expect(dataRow[0][0]).toBe("sub-003");
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

    it("skips writing and warns when the submissionId already exists in the sheet (retry safety)", async () => {
      const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();
      buildWorkbookMock([
        ["submissionId", "formId"],
        ["sub-003", "passport-renewal"], // already recorded
      ]);

      const { workbook } = buildWorkbookMock([
        ["submissionId", "formId"],
        ["sub-003", "passport-renewal"],
      ]);

      await processor.process(makePayload("sub-003"));

      expect(workbook.xlsx.writeFile).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("already recorded"),
      );
      warn.mockRestore();
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

    it("returns early without writing when payload has no spreadsheet processor entries", async () => {
      // Branch: `if (entries.length === 0) return { kind: "completed" };`
      const { workbook } = buildWorkbookMock();
      const payload = makePayload();
      payload.processors = [];

      const result = await processor.process(payload);

      expect(result).toEqual({ kind: "completed" });
      expect(workbook.xlsx.writeFile).not.toHaveBeenCalled();
      expect(workbook.addWorksheet).not.toHaveBeenCalled();
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

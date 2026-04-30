import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as ExcelJS from "exceljs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ISubmissionProcessor } from "./submission-processor.interface";
import type {
  SubmissionCreatedEvent,
  StepScopedValues,
} from "../submissions.types";

/** Column index (1-based) where the submission ID is stored — used for dedup checks. */
const SUBMISSION_ID_COL = 1;

@Injectable()
export class SpreadsheetProcessor implements ISubmissionProcessor {
  readonly type = "spreadsheet" as const;
  private readonly logger = new Logger(SpreadsheetProcessor.name);
  private readonly exportDir: string;

  constructor(config: ConfigService) {
    this.exportDir =
      config.get<string>("spreadsheet.exportDir") ??
      join(process.cwd(), "exports");
  }

  async process(payload: SubmissionCreatedEvent): Promise<void> {
    const cfg =
      payload.processors.find((p) => p.type === "spreadsheet")?.config ?? {};

    const filename = (cfg["filename"] as string | undefined) ?? payload.formId;
    const filePath = join(this.exportDir, `${filename}.xlsx`);

    mkdirSync(this.exportDir, { recursive: true });

    const workbook = new ExcelJS.Workbook();
    const sheetName = "Submissions";

    // Load the existing workbook if it exists; start fresh otherwise.
    try {
      await workbook.xlsx.readFile(filePath);
    } catch {
      // File does not exist yet — a new one will be created on write.
    }

    let sheet = workbook.getWorksheet(sheetName);
    const isNew = !sheet;

    if (isNew) {
      sheet = workbook.addWorksheet(sheetName);
    }

    // Idempotency: scan column 1 for the submissionId. If already present,
    // this is a duplicate invocation — bail out without writing.
    const rowCount = sheet!.rowCount;
    for (let r = 2; r <= rowCount; r++) {
      const existingId = sheet!.getRow(r).getCell(SUBMISSION_ID_COL).value;
      if (existingId === payload.submissionId) {
        this.logger.warn(
          `[spreadsheet] Submission ${payload.submissionId} already recorded in ${filePath} — skipping`,
        );
        return;
      }
    }

    const flatValues = flattenValues(payload.values);

    // Write header row only for brand-new sheets.
    if (isNew) {
      sheet!.addRow([
        "submissionId",
        "formId",
        "formVersion",
        "submittedAt",
        ...Object.keys(flatValues),
      ]);
    }

    sheet!.addRow([
      payload.submissionId,
      payload.formId,
      payload.formVersion,
      payload.meta.submittedAt,
      ...Object.values(flatValues),
    ]);

    await workbook.xlsx.writeFile(filePath);

    this.logger.log(
      `[spreadsheet] Recorded submission ${payload.submissionId} → ${filePath}`,
    );
  }
}

/**
 * Flatten step-scoped values into a single record keyed by "stepId.fieldId".
 * This produces a stable, predictable column order for the spreadsheet.
 */
function flattenValues(values: StepScopedValues): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [stepId, fields] of Object.entries(values)) {
    for (const [fieldId, value] of Object.entries(fields)) {
      result[`${stepId}.${fieldId}`] = value;
    }
  }
  return result;
}

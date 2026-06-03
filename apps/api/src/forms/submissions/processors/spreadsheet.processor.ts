import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as ExcelJS from "exceljs";
import { mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import type {
  ISubmissionProcessor,
  ProcessorOutput,
} from "./submission-processor.interface";
import type {
  SubmissionCreatedEvent,
  SubmissionValues,
} from "../submissions.types";

/** Column index (1-based) holding the per-entry dedup token
 *  `${submissionId}:${index}` — scanned for idempotency checks. */
const SUBMISSION_REF_COL = 1;

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

  async process(payload: SubmissionCreatedEvent): Promise<ProcessorOutput> {
    // Per-entry dispatch (issue #95): act on exactly the entry addressed by
    // processorIndex. Defaults to 0 for direct single-entry invocation;
    // production dispatch (listener/consumer) always sets it.
    const index = payload.processorIndex ?? 0;
    const entry = payload.processors[index];

    // Defensive: per-entry dispatch never invokes us without a matching entry,
    // but a corrupted/out-of-range index should be a no-op, not a throw.
    if (!entry) return { kind: "completed" };

    mkdirSync(this.exportDir, { recursive: true });

    await this.processEntry(payload, entry.config ?? {}, index);

    return { kind: "completed" };
  }

  private async processEntry(
    payload: SubmissionCreatedEvent,
    cfg: Record<string, unknown>,
    index: number,
  ): Promise<void> {
    // basename strips any directory segments so a recipe-supplied filename like
    // "../../etc/passwd" can't escape exportDir (path traversal).
    const rawFilename =
      (cfg["filename"] as string | undefined) ?? payload.formId;
    const filename = basename(rawFilename);
    const filePath = join(this.exportDir, `${filename}.xlsx`);

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

    // Per-entry idempotency: the dedup token is `${submissionId}:${index}`, not
    // the bare submissionId. Two spreadsheet entries writing the same file
    // therefore dedup against their own prior write — entry #2 no longer sees
    // entry #1's row and wrongly skips, and a *retry* of one entry won't
    // double-write. NOTE: this addresses dedup correctness only, not concurrent
    // writes — two entries (or two submissions) appending to the same file race
    // on read-modify-writeFile and can lose a row. That shared-file write race
    // pre-dates per-entry dispatch; tracked in #702.
    const dedupToken = `${payload.submissionId}:${index}`;

    // Scan column 1 for this entry's token. If already present, this is a
    // duplicate invocation — bail out without writing.
    const rowCount = sheet!.rowCount;
    for (let r = 2; r <= rowCount; r++) {
      const existingRef = sheet!.getRow(r).getCell(SUBMISSION_REF_COL).value;
      if (existingRef === dedupToken) {
        this.logger.warn(
          `[spreadsheet] Submission ${dedupToken} already recorded in ${filePath} — skipping`,
        );
        return;
      }
    }

    const flatValues = flattenValues(payload.values);

    // Write header row only for brand-new sheets.
    if (isNew) {
      sheet!.addRow([
        "submissionRef",
        "submissionId",
        "formId",
        "formVersion",
        "submittedAt",
        ...Object.keys(flatValues),
      ]);
    }

    sheet!.addRow([
      dedupToken,
      payload.submissionId,
      payload.formId,
      payload.formVersion,
      payload.meta.submittedAt,
      ...Object.values(flatValues),
    ]);

    await workbook.xlsx.writeFile(filePath);

    this.logger.log(
      `[spreadsheet] Recorded submission ${dedupToken} → ${filePath}`,
    );
  }
}

/**
 * Flatten step-scoped values to "stepId.fieldId" keys for a stable column
 * order. Repeatable steps are skipped — column-mapping syntax for them is
 * not defined yet.
 */
function flattenValues(values: SubmissionValues): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [stepId, fields] of Object.entries(values)) {
    if (Array.isArray(fields)) continue;
    for (const [fieldId, value] of Object.entries(fields)) {
      result[`${stepId}.${fieldId}`] = value;
    }
  }
  return result;
}

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

  /** Per-resolved-path serial queue. Each entry is the tail of the promise
   *  chain for one `filePath`; a new turn for that path chains onto it so the
   *  read-modify-write critical sections never interleave. Keyed on the
   *  resolved path so different files stay fully parallel. The provider is a
   *  NestJS singleton, so this map is shared across the consumer's concurrent
   *  `Promise.all` dispatch. See `withFileLock`. */
  private readonly fileLocks = new Map<string, Promise<unknown>>();

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

    // Serialize the whole read-modify-write on this resolved path. The consumer
    // dispatches a batch with `Promise.all`, so two entries (or submissions)
    // targeting the same file would otherwise both `readFile` before either
    // `writeFile`s and the second write would clobber the first — a lost row.
    // The lock makes every read observe prior writes. (Single-writer topology:
    // see the NOTE below — an in-process lock fully closes the race.)
    await this.withFileLock(filePath, () =>
      this.appendEntry(payload, filePath, index),
    );
  }

  private async appendEntry(
    payload: SubmissionCreatedEvent,
    filePath: string,
    index: number,
  ): Promise<void> {
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
    // double-write.
    //
    // NOTE: the concurrent-write race this dedup token did NOT fix (two entries
    // or submissions racing on read-modify-writeFile, losing a row — #702) is
    // now closed by the per-path `withFileLock` wrapping this whole section, so
    // every read here observes prior writes. That lock is sufficient *because of
    // the single-writer-per-file topology*: a given `.xlsx` is only ever written
    // by one process (one task, or a per-task local export dir). If deployment
    // ever shares one export dir across tasks (e.g. EFS), this in-process lock
    // becomes necessary-but-not-sufficient and would need a cross-process
    // strategy (file lock / atomic append store) — see #702.
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

  /**
   * Run `fn` exclusively with respect to `filePath`: calls keyed on the same
   * path execute one at a time, in arrival order, while different paths run
   * concurrently.
   *
   * Each call chains onto the prior call's tail and replaces it. The chain
   * advances on the prior turn's *settlement* (success or failure), so a turn
   * that throws — which the caller relies on to NACK and let SQS retry —
   * propagates to its own caller but never breaks the chain for the next
   * waiter. The map entry is deleted once its chain drains, so it stays bounded
   * (and is bounded by distinct form filenames regardless).
   */
  private withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
    const prior = this.fileLocks.get(filePath) ?? Promise.resolve();

    // Start `fn` once the prior turn settles, whether it resolved or rejected.
    const result = prior.then(fn, fn);

    // The stored tail must never reject, or the next waiter's continuation
    // (and Node's unhandled-rejection tracking) would see a rejected chain.
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.fileLocks.set(filePath, tail);

    // Drop the entry once this turn's tail drains, unless a later turn has
    // already chained on and replaced it.
    void tail.then(() => {
      if (this.fileLocks.get(filePath) === tail) {
        this.fileLocks.delete(filePath);
      }
    });

    return result;
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

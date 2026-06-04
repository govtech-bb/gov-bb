import { Injectable, Logger } from "@nestjs/common";
import type {
  ISubmissionProcessor,
  ProcessorOutput,
} from "./submission-processor.interface";
import type { SubmissionCreatedEvent } from "../submissions.types";

@Injectable()
export class OpencrvsProcessor implements ISubmissionProcessor {
  readonly type = "opencrvs" as const;
  private readonly logger = new Logger(OpencrvsProcessor.name);

  async process(payload: SubmissionCreatedEvent): Promise<ProcessorOutput> {
    // Per-entry dispatch (issue #95): act on exactly the entry addressed by
    // processorIndex. The index is the position within the frozen processors[]
    // snapshot, so the `${submissionId}:${index}` idempotency key stays stable
    // across retries. Defaults to 0 for direct single-entry invocation;
    // production dispatch (listener/consumer) always sets it.
    const index = payload.processorIndex ?? 0;
    const entry = payload.processors[index];

    // Defensive: per-entry dispatch never invokes us without a matching entry,
    // but a corrupted/out-of-range index should be a no-op, not a throw.
    if (!entry) return { kind: "completed" };

    await this.processEntry(payload, entry.config ?? {}, index);

    return { kind: "completed" };
  }

  private async processEntry(
    payload: SubmissionCreatedEvent,
    cfg: Record<string, unknown>,
    index: number,
  ): Promise<void> {
    const endpoint = cfg["endpoint"] as string | undefined;
    if (!endpoint) {
      this.logger.warn(
        `[opencrvs] No endpoint configured for submission ${payload.submissionId} — skipping`,
      );
      return;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // X-Idempotency-Key lets the OpenCRVS server deduplicate retried POSTs.
      // The index suffix distinguishes multiple opencrvs entries on the same
      // submission so each entry can retry without colliding with the others.
      "X-Idempotency-Key": `${payload.submissionId}:${index}`,
    };

    const token = cfg["token"] as string | undefined;
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        submissionId: payload.submissionId,
        formId: payload.formId,
        formVersion: payload.formVersion,
        values: payload.values,
        submittedAt: payload.meta.submittedAt,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `[opencrvs] Endpoint ${endpoint} responded with HTTP ${response.status}`,
      );
    }

    this.logger.log(
      `[opencrvs] Forwarded submission ${payload.submissionId} to ${endpoint}`,
    );
  }
}

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
    // Iterate over entries by position in payload.processors so the
    // idempotency key index stays stable regardless of how same-type
    // entries are ordered relative to other types.
    for (let i = 0; i < payload.processors.length; i++) {
      const entry = payload.processors[i];
      if (entry.type !== "opencrvs") continue;
      await this.processEntry(payload, entry.config ?? {}, i);
    }

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

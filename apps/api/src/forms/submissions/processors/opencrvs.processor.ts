import { Injectable, Logger } from "@nestjs/common";
import type { ISubmissionProcessor } from "./submission-processor.interface";
import type { SubmissionCreatedEvent } from "../submissions.types";

@Injectable()
export class OpencrvsProcessor implements ISubmissionProcessor {
  readonly type = "opencrvs" as const;
  private readonly logger = new Logger(OpencrvsProcessor.name);

  async process(payload: SubmissionCreatedEvent): Promise<void> {
    const cfg =
      payload.processors.find((p) => p.type === "opencrvs")?.config ?? {};

    const endpoint = cfg["endpoint"] as string | undefined;
    if (!endpoint) {
      this.logger.warn(
        `[opencrvs] No endpoint configured for submission ${payload.submissionId} — skipping`,
      );
      return;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // X-Idempotency-Key lets the OpenCRVS server deduplicate retried POSTs:
      // a second request with the same key returns the original result without
      // re-processing the registration.
      "X-Idempotency-Key": payload.submissionId,
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

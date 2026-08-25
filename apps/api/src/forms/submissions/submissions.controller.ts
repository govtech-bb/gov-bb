import { Body, Controller, Headers, Logger, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { ConfigService } from "@nestjs/config";
import { SubmissionsService } from "./submissions.service";
import { CreateSubmissionDto } from "./dto";
import { CreateSubmissionDocs } from "./submissions.docs";
import { ApiResponse } from "@/common/response";
import { isValidSecretToken } from "@/common/secret-token";
import type { ApiResponseShape } from "@/common/response";
import type { FormSubmissionEntity } from "@/database/entities/form-submission.entity";
import { SubmissionPayloadSizePipe } from "./submission-payload-size.pipe";

@ApiTags("Submissions")
@ApiBearerAuth()
@Controller("submissions")
export class SubmissionsController {
  private readonly logger = new Logger(SubmissionsController.name);

  constructor(
    private readonly submissionsService: SubmissionsService,
    private readonly configService: ConfigService,
  ) {
    // ALLOW_PREVIEW_SUBMISSIONS was retired in favour of the per-form
    // allowlist below (ADR 0066). The env schema is .passthrough(), so a value
    // still sitting in a deployed task definition is silently ignored — say so
    // once at boot rather than leaving the behaviour change to be rediscovered.
    if (this.configService.get<string>("ALLOW_PREVIEW_SUBMISSIONS")) {
      this.logger.warn(
        "ALLOW_PREVIEW_SUBMISSIONS is set but no longer read — preview " +
          "submissions are now scoped per form via PREVIEW_SUBMISSION_FORM_IDS " +
          "(ADR 0066).",
      );
    }
  }

  @Post()
  @Throttle({
    short: { limit: 3, ttl: 10_000 },
    medium: { limit: 10, ttl: 60_000 },
    long: { limit: 50, ttl: 3_600_000 },
  })
  @CreateSubmissionDocs()
  async create(
    @Headers("idempotency-key") idempotencyKey: string,
    @Headers("x-smoke-submission") smokeToken: string | undefined,
    @Headers("x-recipe-preview") previewToken: string | undefined,
    @Body(SubmissionPayloadSizePipe) body: CreateSubmissionDto,
  ): Promise<ApiResponseShape<FormSubmissionEntity>> {
    // Drop every processor for a smoke-originated submission — but only when
    // the header carries the configured SMOKE_SUBMISSION_TOKEN. Fail-closed:
    // when the secret is unset (every ordinary environment / public caller),
    // isValidSecretToken returns false and processors fire as normal (#1252).
    const isSmokeSubmission = isValidSecretToken(
      this.configService.get<string>("SMOKE_SUBMISSION_TOKEN", ""),
      smokeToken,
    );

    // A valid X-Recipe-Preview token lets a reviewer submit a published-but-
    // flagged (non-public) form — the visibility gate is bypassed downstream
    // (#1682). Fail-closed: unset token / wrong value → false.
    //
    // PREVIEW_SUBMISSION_FORM_IDS names the forms that get that same bypass on
    // an environment (sandbox/staging) without a per-request token, so a
    // feature-flagged form can be tested end-to-end. Every other form still
    // needs the token. It only reaches non-public *published file* recipes —
    // DB-only builder drafts still resolve from the files source and stay
    // unsubmittable (ADR 0043 / #145). Empty by default, so production has no
    // env-level bypass at all (ADR 0066, superseding the blanket ADR 0065).
    const previewSubmissionFormIds = this.configService
      .get<string>("PREVIEW_SUBMISSION_FORM_IDS", "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    const bypassVisibility =
      previewSubmissionFormIds.includes(body.formId) ||
      isValidSecretToken(
        this.configService.get<string>("RECIPE_PREVIEW_TOKEN", ""),
        previewToken,
      );

    const { data, message, statusCode, deferred, resolvedPolyclinic } =
      await this.submissionsService.submit({
        ...body,
        idempotencyKey,
        ...(isSmokeSubmission && { isSmokeSubmission: true }),
        ...(bypassVisibility && { bypassVisibility: true }),
      });

    // Extra outcome data rides on `meta` (like `deferred`): the resolved
    // polyclinic name lets the confirmation page name the Environmental Health
    // Department the request went to. Only attach `meta` when there is
    // something to carry.
    const meta = {
      ...(deferred && { deferred }),
      ...(resolvedPolyclinic && { resolvedPolyclinic }),
    };

    // `statusCode` is the outcome the service computed (201 new / 200 replay /
    // 202 processing). It becomes the HTTP status via the global
    // ResponseInterceptor, which runs res.status(body.statusCode) after this
    // returns. Keep passing it through here — that's what drives the wire
    // status. An @HttpCode on this handler would be dead code: the interceptor
    // runs later and overrides it. Guarded by
    // submissions.controller.http.spec.ts (#2365).
    return ApiResponse.success(data, {
      message,
      statusCode,
      ...(Object.keys(meta).length > 0 && { meta }),
    });
  }
}

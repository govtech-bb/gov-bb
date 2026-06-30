import {
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Param,
  Res,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { FormDefinitionsService } from "./form-definitions.service";
import { FormDisabledOverridesService } from "../form-disabled-overrides/form-disabled-overrides.service";
import { GetFormDefinitionDocs } from "./form-definitions.docs";
import { ApiResponse as AppApiResponse } from "@/common/response";
import { isValidSecretToken } from "@/common/secret-token";
import type { ApiResponseShape } from "@/common/response";
import type {
  PublicFormSummary,
  ServiceContract,
} from "@govtech-bb/form-types";

/**
 * Cross-app shared preview cookie (#1646 Phase 3, ADR 0058). Byte-identical to
 * the one apps/landing mints (name/path/4h TTL) so the browser stores a single
 * grant visible to landing, forms and the API across the parent domain.
 */
const PREVIEW_COOKIE_NAME = "preview";
/** 4 hours, in MILLISECONDS — express `res.cookie` maxAge unit. Matches landing's 4h. */
const PREVIEW_COOKIE_MAX_AGE_MS = 4 * 60 * 60 * 1000;
/**
 * Cookie values that grant a visibility bypass: the level name, or the legacy
 * boolean grant `"1"`. Mirrors `levelFromCookie` in apps/landing/src/lib/preview.ts.
 */
const PREVIEW_COOKIE_BYPASS_VALUES = new Set(["preview", "draft", "1"]);

/**
 * Pull the `preview` cookie's value out of a raw `Cookie` request header without
 * a cookie-parser dependency. Returns undefined when the cookie is absent.
 */
function readPreviewCookie(
  cookieHeader: string | undefined,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() === PREVIEW_COOKIE_NAME) {
      return pair.slice(eq + 1).trim();
    }
  }
  return undefined;
}

@ApiTags("Form Definitions")
@ApiBearerAuth()
@Controller("form-definitions")
@Throttle({
  short: { limit: 20, ttl: 10_000 },
  medium: { limit: 120, ttl: 60_000 },
})
export class FormDefinitionsController {
  constructor(
    private readonly formDefinitionsService: FormDefinitionsService,
    private readonly disabledOverridesService: FormDisabledOverridesService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  async getAll(): Promise<ApiResponseShape<PublicFormSummary[]>> {
    // Exclude disabled (tombstoned) forms so the public list matches the 410
    // Gone the single-form GET returns for them — otherwise a disabled form
    // still shows on the forms index and as a landing "Start now" button
    // (issue #615).
    const [data, disabledFormIds] = await Promise.all([
      this.formDefinitionsService.findAll(),
      this.disabledOverridesService.findAllFormIds(),
    ]);
    const disabled = new Set(disabledFormIds);
    const published = data.filter((form) => !disabled.has(form.formId));
    return AppApiResponse.success(published, {
      message: "Form definitions retrieved",
    });
  }

  // Declared before `:formId` so "maintenance" routes here rather than being
  // captured as a form ID. Public (no preview token): a maintenance form is
  // advertised so landing can render an "under maintenance" notice (#1694).
  @Get("maintenance")
  async getMaintenance(): Promise<ApiResponseShape<string[]>> {
    const formIds = await this.formDefinitionsService.findMaintenanceFormIds();
    return AppApiResponse.success(formIds, {
      message: "Forms under maintenance retrieved",
    });
  }

  @Get(":formId")
  @GetFormDefinitionDocs()
  async get(
    @Param("formId") formId: string,
    // `?preview=` → visibility bypass: serve the published recipe of a
    // non-public form (submission stays allowed). `?draft=` → DB scratch
    // sourcing: serve the in-progress builder draft (submission blocked). Both
    // validate against RECIPE_PREVIEW_TOKEN and both bypass the #1646 gate
    // (#1682).
    @Headers("x-recipe-preview") previewToken?: string,
    @Headers("x-recipe-draft") draftToken?: string,
    @Res({ passthrough: true }) res?: Response,
    // The shared `preview` cookie (set by landing's SSR or minted below). Its
    // presence grants the visibility bypass cross-app — see #1646 Phase 3.
    @Headers("cookie") cookieHeader?: string,
  ): Promise<ApiResponseShape<ServiceContract>> {
    const override = await this.disabledOverridesService.find(formId);
    if (override) {
      // 410 Gone — the kill switch is engaged. Body shape matches the spec.
      // A disabled form remains disabled even with a valid preview/draft token.
      throw new HttpException(
        { disabled: true, reason: override.reason },
        HttpStatus.GONE,
      );
    }

    const configuredToken = this.configService.get<string>(
      "RECIPE_PREVIEW_TOKEN",
      "",
    );
    const validPreviewToken = isValidSecretToken(configuredToken, previewToken);
    const draft = isValidSecretToken(configuredToken, draftToken);

    // A shared `preview` cookie grants the visibility bypass by its PRESENCE
    // alone — the value is only the level, never a secret (#1646 Phase 3, a
    // forgeable rollout gate per ADR 0013/0058). It NEVER triggers DB sourcing;
    // a `draft`-level cookie bypasses visibility but the in-progress DB scratch
    // still requires the per-request X-Recipe-Draft secret header (ADR 0011).
    const cookieValue = readPreviewCookie(cookieHeader);
    const hasPreviewCookie =
      cookieValue !== undefined &&
      PREVIEW_COOKIE_BYPASS_VALUES.has(cookieValue);
    const bypassVisibility = validPreviewToken || hasPreviewCookie;

    if (bypassVisibility || draft) {
      // Prevent CDN/proxy/browser caching for preview/draft responses — they
      // may carry non-public or unpublished DB content that must not be cached.
      res?.setHeader("Cache-Control", "no-store");
    }

    // Forms is a static client-only SPA and cannot set landing's httpOnly cookie
    // itself, so the API mints it here when a valid preview token arrives via
    // header (the SPA forwarding a `?preview=` URL token). Byte-identical to
    // landing's cookie (name/domain/path) so the browser stores ONE shared
    // grant. The `?draft=` path mints no cookie — DB sourcing stays per-request.
    if (validPreviewToken && res) {
      const domain =
        this.configService.get<string>("PREVIEW_COOKIE_DOMAIN", "") ||
        undefined;
      res.cookie(PREVIEW_COOKIE_NAME, "preview", {
        domain,
        httpOnly: true,
        sameSite: "lax",
        secure: this.configService.get<string>("NODE_ENV") === "production",
        maxAge: PREVIEW_COOKIE_MAX_AGE_MS,
        path: "/",
      });
    }

    const data = await this.formDefinitionsService.findByFormId({
      formId,
      bypassVisibility,
      draft,
    });
    return AppApiResponse.success(data, {
      message: "Form definition retrieved",
    });
  }
}

import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { FormConfigService } from "@/forms/form-config/form-config.service";
import { RecipeFileLoaderService } from "@/forms/form-definitions/recipe-file-loader.service";
import { auditReferencePrefixes } from "./reference-prefix-audit";
import type { FormReferencePrefix } from "./reference-prefix-audit";

/**
 * Boot-time audit of the MDA codes recipes declare for the submission
 * reference prefix (#2318).
 *
 * A wrong `mdaCode` mints permanently wrong citizen-facing references, so the
 * cross-checks run at deploy rather than surfacing later from a case list.
 * Mirrors the webhook-destinations audit: reports loudly, never throws — a
 * reference-prefix inconsistency must not down the API, and a DB error at boot
 * is logged and skipped.
 */
@Injectable()
export class ReferencePrefixAuditService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReferencePrefixAuditService.name);
  /** Populated at boot; surfaced for the monitoring endpoint and tests. */
  issues: string[] = [];

  constructor(
    private readonly recipes: RecipeFileLoaderService,
    private readonly formConfig: FormConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    let ministryKeys: Map<string, string>;
    try {
      ministryKeys = await this.formConfig.listMinistryKeysByForm();
    } catch (err) {
      this.logger.warn(
        `[reference-prefix] audit skipped — could not read mda_contact at boot: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return;
    }

    const forms: FormReferencePrefix[] = this.recipes
      .findAll()
      .map(({ formId }) => ({
        formId,
        mdaCode: mdaCodeOf(this.recipes.findByFormId({ formId })),
        ministryKey: ministryKeys.get(formId) ?? null,
      }));

    this.issues = auditReferencePrefixes(forms);
    for (const issue of this.issues) {
      this.logger.error(`[reference-prefix] ${issue}`);
    }
    if (this.issues.length === 0) {
      const declared = forms.filter((f) => f.mdaCode).length;
      this.logger.log(
        `[reference-prefix] OK — ${declared} form(s) declare an MDA prefix`,
      );
    }
  }
}

function mdaCodeOf(
  recipe: { processors?: unknown } | null,
): string | undefined {
  const processors = (recipe?.processors ?? []) as {
    type: string;
    config?: { mapping?: { mdaCode?: string } };
  }[];
  return processors.find((p) => p.type === "webhook")?.config?.mapping?.mdaCode;
}

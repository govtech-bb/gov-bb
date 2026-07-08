import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FormDefinitionRepository } from "./form-definition.repository";
import { RecipeFileLoaderService } from "./recipe-file-loader.service";
import { RegistryService } from "@/registry/registry.service";
import { FormConfigService } from "../form-config/form-config.service";
import { ServiceStatusService } from "@/services/service-status.service";
import { ServiceStatus } from "@/database/entities/service-status.entity";
import { AppError } from "@/common/errors";
import { getRecipeVisibility } from "@govtech-bb/form-types";
import type {
  Processor,
  PublicFormSummary,
  RecipeVisibility,
  ServiceContract,
  ServiceContractRecipe,
} from "@govtech-bb/form-types";

type RecipeSource = "db" | "files" | "both";

/**
 * Level mapping (#1896): a `service_status` row FULLY overrides the recipe's
 * `meta.visibility` seed — `enabled` can even raise a preview/draft recipe to
 * public (the admin's explicit, audited choice). No row (`status` undefined
 * or null) falls back to the recipe visibility unchanged, so an un-flagged
 * service behaves exactly as today. `disabled` maps to `preview`, not
 * `draft` — it gates visibility only; draft's DB-scratch-source meaning is
 * untouched. Exported for direct unit testing (see isLeafName for the
 * precedent).
 */
export function effectiveVisibility(
  recipeVisibility: RecipeVisibility,
  status: ServiceStatus | null | undefined,
): RecipeVisibility {
  switch (status) {
    case ServiceStatus.ENABLED:
      return "public";
    case ServiceStatus.FORM_DISABLED:
      return "maintenance";
    case ServiceStatus.DISABLED:
      return "preview";
    default:
      return recipeVisibility;
  }
}

@Injectable()
export class FormDefinitionsService {
  private readonly logger = new Logger(FormDefinitionsService.name);

  constructor(
    private readonly formDefRepo: FormDefinitionRepository,
    private readonly registryService: RegistryService,
    private readonly recipeFileLoader: RecipeFileLoaderService,
    private readonly configService: ConfigService,
    private readonly formConfigService: FormConfigService,
    private readonly serviceStatusService: ServiceStatusService,
  ) {}

  /** `slug → status` for every service, fetched once per request (#1896). */
  private async getStatusMap(): Promise<Map<string, ServiceStatus>> {
    const rows = await this.serviceStatusService.list();
    return new Map(rows.map((row) => [row.slug, row.status]));
  }

  private source(): RecipeSource {
    const raw = this.configService.get<string>("RECIPE_SOURCE", "files");
    if (raw === "db" || raw === "both") {
      // Honour `db` and `both` only as dev iteration escape hatches. Outside
      // of development (e.g. NODE_ENV=production, =test), force `files` so
      // unpublished `form_definitions` rows can't leak to end users.
      // See issue #145.
      const nodeEnv = this.configService.get<string>("NODE_ENV");
      if (nodeEnv !== "development") {
        this.logger.warn(
          `RECIPE_SOURCE=${raw} is only honored when NODE_ENV=development (got NODE_ENV=${nodeEnv ?? "undefined"}); falling back to "files".`,
        );
        return "files";
      }
      return raw;
    }
    return "files";
  }

  /**
   * List the published forms. `includeNonPublic` is the token-gated authoring
   * path (#1835): when set, non-public forms are kept and each entry carries
   * its *effective* visibility (#1896: recipe visibility overridden by any
   * `service_status` row). Default (the public index) omits non-public forms
   * and stamps no visibility, so the public list contract is unchanged.
   */
  async findAll(includeNonPublic = false): Promise<PublicFormSummary[]> {
    const source = this.source();
    const statusMap = await this.getStatusMap();

    if (source === "files") {
      return this.gateEntries(
        this.recipeFileLoader.findAll(),
        statusMap,
        includeNonPublic,
      );
    }

    const dbEntries = await this.loadDbEntries();

    if (source === "db") {
      return this.gateEntries(dbEntries, statusMap, includeNonPublic);
    }

    // source === "both": union of file + DB entries deduped by formId.
    // DB wins on collision so a draft can override a published file recipe.
    const dbFormIds = new Set(dbEntries.map((e) => e.formId));
    const fileEntries = this.recipeFileLoader
      .findAll()
      .filter((e) => !dbFormIds.has(e.formId));
    return this.gateEntries(
      [...dbEntries, ...fileEntries],
      statusMap,
      includeNonPublic,
    );
  }

  /**
   * Apply the #1896 service_status gate to a raw (any-visibility) entry list:
   * each entry's recipe visibility is overridden by its status row (if any),
   * then filtered/stamped exactly like the old #1646/#1835 gate. Shared by
   * every source (files/db/both) so they all apply one gate.
   */
  private gateEntries(
    entries: PublicFormSummary[],
    statusMap: Map<string, ServiceStatus>,
    includeNonPublic: boolean,
  ): PublicFormSummary[] {
    const result: PublicFormSummary[] = [];
    for (const entry of entries) {
      const visibility = effectiveVisibility(
        entry.visibility ?? "preview",
        statusMap.get(entry.formId),
      );
      if (visibility !== "public" && !includeNonPublic) continue;
      if (includeNonPublic) {
        result.push({ ...entry, visibility });
      } else {
        const { visibility: _visibility, ...rest } = entry;
        result.push(rest);
      }
    }
    return result;
  }

  /**
   * Form IDs currently under maintenance (#1694), by *effective* visibility
   * (#1896): recipe-maintenance forms with no overriding row, plus any form
   * whose row says `form_disabled`, minus forms whose row overrides
   * maintenance away. Mirrors findAll's source dispatch. Maintenance forms are
   * non-public (so absent from findAll), but advertised here so landing can
   * show an "under maintenance" notice.
   */
  async findMaintenanceFormIds(): Promise<string[]> {
    const source = this.source();
    const statusMap = await this.getStatusMap();

    if (source === "files") {
      return this.maintenanceIds(this.recipeFileLoader.findAll(), statusMap);
    }

    const dbIds = this.maintenanceIds(await this.loadDbEntries(), statusMap);
    if (source === "db") {
      return dbIds;
    }

    // source === "both": dev-only escape hatch — union of DB + file IDs.
    return [
      ...new Set([
        ...dbIds,
        ...this.maintenanceIds(this.recipeFileLoader.findAll(), statusMap),
      ]),
    ];
  }

  private maintenanceIds(
    entries: PublicFormSummary[],
    statusMap: Map<string, ServiceStatus>,
  ): string[] {
    return entries
      .filter(
        (e) =>
          effectiveVisibility(
            e.visibility ?? "preview",
            statusMap.get(e.formId),
          ) === "maintenance",
      )
      .map((e) => e.formId);
  }

  /**
   * Every DB-backed form, deduped by formId (latest by createdAt), each
   * always carrying its raw recipe `visibility` — unfiltered. Shared by
   * findAll and findMaintenanceFormIds so both derive from the same
   * (formId, visibility) pairs and apply the #1896 gate on top (#1896).
   */
  private async loadDbEntries(): Promise<PublicFormSummary[]> {
    const entities = await this.formDefRepo.find({
      order: { createdAt: "DESC" },
    });
    const seen = new Set<string>();
    const result: PublicFormSummary[] = [];
    for (const entity of entities) {
      if (seen.has(entity.formId)) continue;
      seen.add(entity.formId);
      result.push({
        formId: entity.formId,
        // #1196: version is retired on the DB scratch row (nullable); the
        // list keeps the field as a frozen breadcrumb ("" when absent).
        version: entity.version ?? "",
        title: entity.schema.title,
        // See RecipeFileLoaderService.findAll: category mirrors the
        // contact-details title and is omitted when absent.
        ...(entity.schema.contactDetails?.title && {
          category: entity.schema.contactDetails.title,
        }),
        visibility: getRecipeVisibility(entity.schema),
      });
    }
    return result;
  }

  async findByFormId({
    formId,
    includeProcessors = false,
    bypassVisibility = false,
    draft = false,
  }: {
    formId: string;
    includeProcessors?: boolean;
    bypassVisibility?: boolean;
    draft?: boolean;
  }): Promise<ServiceContract> {
    const recipe = await this.getRecipe({ formId, bypassVisibility, draft });
    if (!recipe) {
      throw AppError.notFound("Form definition", { formId });
    }

    const contract = await this.registryService.hydrateForm(recipe);

    // Merge per-form, per-environment processors from `form_config` over the
    // recipe's (#716). DB wins on payment: the payment processor is first-wins
    // on duplicate `type: "payment"` entries (payment.processor.ts), so a pure
    // append would leave the committed recipe value silently winning. Drop
    // recipe payments first when the DB set has one.
    const dbProcessors = await this.formConfigService.resolveProcessors(formId);
    const recipeProcessors = (contract.processors ?? []) as Processor[];
    const dbHasPayment = dbProcessors.some((p) => p.type === "payment");
    const baseProcessors = dbHasPayment
      ? recipeProcessors.filter((p) => p.type !== "payment")
      : recipeProcessors;
    const mergedProcessors = [...baseProcessors, ...dbProcessors];

    // Safe public flag derived from the merged processor set. Exposed on every
    // response (client and submission paths) so the chat handoff check can
    // tell whether a form needs payment without seeing processor internals.
    // See issue #965.
    const requiresPayment = mergedProcessors.some((p) => p.type === "payment");

    if (!includeProcessors) {
      // Client path: strip processors, surface only the safe flag.
      const { processors: _processors, ...stripped } = contract;
      return { ...stripped, requiresPayment } as ServiceContract;
    }

    // Submission path: keep processors. Only swap in the merged set when DB
    // actually contributes anything (matches pre-#965 behaviour for the empty
    // DB case).
    if (dbProcessors.length === 0) return { ...contract, requiresPayment };
    return { ...contract, processors: mergedProcessors, requiresPayment };
  }

  /**
   * Resolve a raw recipe by formId from the configured source. Public so other
   * services (e.g. FormDraftsService) can read a recipe without reaching into
   * the `form_definitions` table directly — which would expose unpublished
   * builder scratch space (issue #145).
   *
   * Two independent, token-gated signals (#1682, split from the single
   * `preview` flag #1646 conflated):
   * - `draft` forces the "both" path (DB scratch first, file fallback)
   *   regardless of the configured source or NODE_ENV — the in-progress builder
   *   draft. Submission is blocked downstream for this path.
   * - `bypassVisibility` only skips the launch gate; it does NOT touch the
   *   source, so it serves the *published* recipe of a non-public form.
   *
   * Applies the #1646 visibility gate — now on *effective* visibility (#1896:
   * recipe visibility overridden by any `service_status` row for this
   * formId) — a non-public recipe resolves to null for the public, so every
   * consumer treats a hidden form as missing (404). Either signal (both
   * derive from a valid `RECIPE_PREVIEW_TOKEN`) bypasses the gate, in which
   * case `service_status` isn't even consulted.
   */
  async getRecipe({
    formId,
    bypassVisibility = false,
    draft = false,
  }: {
    formId: string;
    bypassVisibility?: boolean;
    draft?: boolean;
  }): Promise<ServiceContractRecipe | null> {
    const recipe = await this.resolveRecipe({ formId, draft });

    // Launch gate (#1646/#1896): a non-public recipe is invisible to the
    // public — getRecipe returns null exactly as if it didn't exist, so every
    // consumer (the single-form GET, draft-create, …) 404s. A valid preview or
    // draft token bypasses the gate so reviewers can resolve non-public
    // recipes.
    if (recipe && !bypassVisibility && !draft) {
      const status = await this.serviceStatusService.getStatus(formId);
      if (
        effectiveVisibility(getRecipeVisibility(recipe), status) !== "public"
      ) {
        return null;
      }
    }
    return recipe;
  }

  /**
   * Resolve a raw recipe from the configured source, without the visibility
   * gate. Private — callers must go through getRecipe so the #1646 gate is
   * always applied.
   */
  private async resolveRecipe({
    formId,
    draft,
  }: {
    formId: string;
    draft: boolean;
  }): Promise<ServiceContractRecipe | null> {
    // When draft is true, force "both" so the DB scratch is consulted regardless
    // of the configured RECIPE_SOURCE or NODE_ENV. Otherwise, use the normal
    // source() resolution (which enforces the dev-only guard).
    const effectiveSource: RecipeSource = draft ? "both" : this.source();

    if (effectiveSource === "files") {
      return this.recipeFileLoader.findByFormId({ formId });
    }

    if (effectiveSource === "db") {
      return this.getRecipeFromDb({ formId });
    }

    // effectiveSource === "both" — the draft path (#1196). The DB scratch row
    // is the in-progress authoring draft: prefer it, else fall back to the
    // canonical flat file. A form is one draft + one canonical recipe.
    const dbRecipe = await this.getRecipeFromDb({ formId });
    return dbRecipe ?? this.recipeFileLoader.findByFormId({ formId });
  }

  private async getRecipeFromDb({
    formId,
  }: {
    formId: string;
  }): Promise<ServiceContractRecipe | null> {
    const entity = await this.formDefRepo.findOne({
      where: { formId },
      order: { createdAt: "DESC" },
    });
    return entity ? entity.schema : null;
  }
}

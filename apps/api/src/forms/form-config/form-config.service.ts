import { Injectable } from "@nestjs/common";
import { parseFormConfigBlob } from "@govtech-bb/form-types";
import type { Processor } from "@govtech-bb/form-types";
import { FormConfigRepository } from "./form-config.repository";
import { MdaContactRepository } from "./mda-contact.repository";

/**
 * Reads per-form, per-environment configuration from the database.
 *
 * The store is intentionally environment-scoped: production carries
 * `form_config` rows pointing at `mda_contact` directory entries, while sandbox
 * has none. Callers treat "no value" as a cue to fall back to a safe default
 * (e.g. a test inbox) rather than an error — see the email processor's
 * `config.*` recipient resolution.
 *
 * No caching: unlike published form contracts (immutable per version),
 * `form_config`/`mda_contact` are mutable — an MDA address can be rotated — and
 * MDA-email sends are low-volume, so a stale cache is a worse trade than a
 * single indexed lookup per send.
 */
@Injectable()
export class FormConfigService {
  constructor(
    private readonly formConfigRepo: FormConfigRepository,
    private readonly mdaContactRepo: MdaContactRepository,
  ) {}

  /**
   * Resolves the private MDA notification address for a form via
   * `form_config → mda_contact`. Returns `null` when the form has no config
   * row, the row references no contact, the contact has been deleted, or its
   * `mda_email` is blank — every miss the caller treats as "use the default".
   */
  async resolveMdaEmail(formId: string): Promise<string | null> {
    const config = await this.formConfigRepo.findOne({ where: { formId } });
    if (!config?.mdaContactId) return null;

    const contact = await this.mdaContactRepo.findOne({
      where: { id: config.mdaContactId },
    });
    const email = contact?.mdaEmail;
    return typeof email === "string" && email.length > 0 ? email : null;
  }

  /**
   * Resolves the public human-readable department name for a form via
   * `form_config → mda_contact.title` — used to address the citizen
   * confirmation email's "what happens next" and footer. Returns `null` on
   * every miss (no config row, no contact, blank title), which the caller
   * treats as a cue to fall back to generic wording rather than an error.
   */
  async resolveDepartmentName(formId: string): Promise<string | null> {
    const config = await this.formConfigRepo.findOne({ where: { formId } });
    if (!config?.mdaContactId) return null;

    const contact = await this.mdaContactRepo.findOne({
      where: { id: config.mdaContactId },
    });
    const title = contact?.title;
    return typeof title === "string" && title.length > 0 ? title : null;
  }

  /**
   * Resolves a form's MDA **ministry key** via `form_config → mda_contact`
   * (#1920/#2020) — the key into the `MDA_WEBHOOK_DESTINATIONS` JSON secret.
   * Returns `null` on every miss (no config row, no/deleted contact, or a blank
   * `ministry_key`), which the webhook path treats as "no destination" and fails
   * loud on at dispatch. Mirrors `resolveMdaEmail`: no caching, DB errors
   * propagate as infra failures.
   */
  async resolveMinistryKey(formId: string): Promise<string | null> {
    const config = await this.formConfigRepo.findOne({ where: { formId } });
    if (!config?.mdaContactId) return null;

    const contact = await this.mdaContactRepo.findOne({
      where: { id: config.mdaContactId },
    });
    const key = contact?.ministryKey;
    return typeof key === "string" && key.length > 0 ? key : null;
  }

  /**
   * Lists the distinct non-blank `ministry_key`s present across `mda_contact`
   * (#1920/#2020). Used by the boot-time webhook-destinations audit to flag a
   * ministry that a form points at but that has no entry in the
   * `MDA_WEBHOOK_DESTINATIONS` secret — a provisioning gap that would DLQ that
   * form's submissions.
   */
  async listConfiguredMinistryKeys(): Promise<string[]> {
    const rows = await this.mdaContactRepo.find();
    const keys = new Set<string>();
    for (const r of rows) {
      if (typeof r.ministryKey === "string" && r.ministryKey.length > 0) {
        keys.add(r.ministryKey);
      }
    }
    return [...keys];
  }

  /**
   * Resolves the per-form, per-environment payment/notification processors from
   * `form_config.config` (#716). Returns `[]` for every *resolved miss* — no
   * config row, a null `config` column, or a blob without a `processors` key —
   * which is the common case (most forms carry no DB processors).
   *
   * A `config` blob that *fails* validation is misconfiguration, not a miss, so
   * `parseFormConfigBlob` is allowed to throw: silently dropping a payment
   * processor would turn a paid form free. Mirroring `resolveMdaEmail`, there is
   * no try/catch, so a DB error propagates as an infra failure (ADR 0032).
   */
  async resolveProcessors(formId: string): Promise<Processor[]> {
    const config = await this.formConfigRepo.findOne({ where: { formId } });
    return parseFormConfigBlob(config?.config).processors ?? [];
  }
}

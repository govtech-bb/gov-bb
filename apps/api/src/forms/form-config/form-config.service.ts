import { Injectable } from "@nestjs/common";
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
}

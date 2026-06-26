import { Injectable } from "@nestjs/common";
import { FormDisabledOverrideRepository } from "./form-disabled-override.repository";
import type { FormDisabledOverrideEntity } from "@/database/entities/form-disabled-override.entity";

@Injectable()
export class FormDisabledOverridesService {
  constructor(private readonly overrideRepo: FormDisabledOverrideRepository) {}

  /**
   * Returns the override row for the given formId, or null if the form is
   * not currently disabled.
   */
  async find(formId: string): Promise<FormDisabledOverrideEntity | null> {
    return this.overrideRepo.findOne({ where: { formId } });
  }

  /**
   * Returns the formId of every currently-disabled form. The public list
   * endpoint uses this to exclude disabled forms, mirroring the 410 Gone the
   * single-form endpoint returns for them (issue #615).
   */
  async findAllFormIds(): Promise<string[]> {
    const rows = await this.overrideRepo.find({ select: { formId: true } });
    return rows.map((row) => row.formId);
  }

  /**
   * Disable the form. Idempotent — re-disabling overwrites the reason and
   * disabledBy fields. `disabled_at` is set by the DB default.
   */
  async disable(
    formId: string,
    reason: string,
    disabledBy: string,
  ): Promise<void> {
    await this.overrideRepo.upsert({ formId, reason, disabledBy }, ["formId"]);
  }

  /**
   * Re-enable the form by deleting the override row. Idempotent — deleting
   * an absent row is a no-op.
   */
  async enable(formId: string): Promise<void> {
    await this.overrideRepo.delete({ formId });
  }
}

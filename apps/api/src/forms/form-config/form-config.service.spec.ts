import { FormConfigService } from "./form-config.service";
import type { FormConfigRepository } from "./form-config.repository";
import type { MdaContactRepository } from "./mda-contact.repository";
import type { FormConfigEntity } from "../../database/entities/form-config.entity";
import type { MdaContactEntity } from "../../database/entities/mda-contact.entity";

function makeService(
  formConfigRow: Partial<FormConfigEntity> | null,
  mdaContactRow: Partial<MdaContactEntity> | null = null,
) {
  const formConfigRepo = {
    findOne: jest.fn().mockResolvedValue(formConfigRow),
  } as unknown as jest.Mocked<FormConfigRepository>;
  const mdaContactRepo = {
    findOne: jest.fn().mockResolvedValue(mdaContactRow),
  } as unknown as jest.Mocked<MdaContactRepository>;
  const service = new FormConfigService(formConfigRepo, mdaContactRepo);
  return { service, formConfigRepo, mdaContactRepo };
}

describe("FormConfigService.resolveMdaEmail", () => {
  it("returns the contact's mda_email when a form_config row references a contact", async () => {
    const { service, formConfigRepo, mdaContactRepo } = makeService(
      { formId: "form-a", mdaContactId: "contact-1" },
      { id: "contact-1", mdaEmail: "mda-notify@gov.bb" },
    );

    await expect(service.resolveMdaEmail("form-a")).resolves.toBe(
      "mda-notify@gov.bb",
    );
    expect(formConfigRepo.findOne).toHaveBeenCalledWith({
      where: { formId: "form-a" },
    });
    expect(mdaContactRepo.findOne).toHaveBeenCalledWith({
      where: { id: "contact-1" },
    });
  });

  it("returns null when the form has no form_config row (e.g. sandbox)", async () => {
    const { service, mdaContactRepo } = makeService(null);

    await expect(service.resolveMdaEmail("form-a")).resolves.toBeNull();
    // No point querying for a contact we have no id for.
    expect(mdaContactRepo.findOne).not.toHaveBeenCalled();
  });

  it("returns null when the row references no contact (mdaContactId null)", async () => {
    const { service, mdaContactRepo } = makeService({
      formId: "form-a",
      mdaContactId: null,
    });

    await expect(service.resolveMdaEmail("form-a")).resolves.toBeNull();
    expect(mdaContactRepo.findOne).not.toHaveBeenCalled();
  });

  it("returns null when the referenced contact no longer exists", async () => {
    const { service } = makeService(
      { formId: "form-a", mdaContactId: "contact-1" },
      null,
    );

    await expect(service.resolveMdaEmail("form-a")).resolves.toBeNull();
  });

  it("returns null when the contact's mda_email is empty", async () => {
    const { service } = makeService(
      { formId: "form-a", mdaContactId: "contact-1" },
      { id: "contact-1", mdaEmail: "" },
    );

    await expect(service.resolveMdaEmail("form-a")).resolves.toBeNull();
  });
});

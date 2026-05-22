import { NotFoundException } from "@nestjs/common";
import { DraftArchiveService } from "./draft-archive.service";
import { FormDefinitionRepository } from "./form-definition.repository";

function makeRepo(): jest.Mocked<FormDefinitionRepository> {
  return {
    delete: jest.fn(),
  } as unknown as jest.Mocked<FormDefinitionRepository>;
}

describe("DraftArchiveService", () => {
  it("deletes the draft row matching (formId, version) and returns void on success", async () => {
    const repo = makeRepo();
    (repo.delete as jest.Mock).mockResolvedValue({ affected: 1 });
    const service = new DraftArchiveService(repo);

    await expect(
      service.archive({ formId: "passport-renewal", version: "1.2.0" }),
    ).resolves.toBeUndefined();

    expect(repo.delete).toHaveBeenCalledWith({
      formId: "passport-renewal",
      version: "1.2.0",
    });
  });

  it("throws NotFoundException when no row was deleted", async () => {
    const repo = makeRepo();
    (repo.delete as jest.Mock).mockResolvedValue({ affected: 0 });
    const service = new DraftArchiveService(repo);

    await expect(
      service.archive({ formId: "ghost", version: "9.9.9" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("propagates repository errors", async () => {
    const repo = makeRepo();
    (repo.delete as jest.Mock).mockRejectedValue(new Error("db down"));
    const service = new DraftArchiveService(repo);

    await expect(
      service.archive({ formId: "x", version: "1.0.0" }),
    ).rejects.toThrow(/db down/);
  });
});

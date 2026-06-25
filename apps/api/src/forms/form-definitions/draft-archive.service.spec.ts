import type { Mock, Mocked } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { DraftArchiveService } from "./draft-archive.service";
import { FormDefinitionRepository } from "./form-definition.repository";

function makeRepo(): Mocked<FormDefinitionRepository> {
  return {
    delete: vi.fn(),
  } as unknown as Mocked<FormDefinitionRepository>;
}

describe("DraftArchiveService", () => {
  it("deletes the single draft row for the formId and returns void on success", async () => {
    const repo = makeRepo();
    (repo.delete as Mock).mockResolvedValue({ affected: 1 });
    const service = new DraftArchiveService(repo);

    await expect(
      service.archive({ formId: "passport-renewal" }),
    ).resolves.toBeUndefined();

    expect(repo.delete).toHaveBeenCalledWith({
      formId: "passport-renewal",
    });
  });

  it("throws NotFoundException when no row was deleted", async () => {
    const repo = makeRepo();
    (repo.delete as Mock).mockResolvedValue({ affected: 0 });
    const service = new DraftArchiveService(repo);

    await expect(service.archive({ formId: "ghost" })).rejects.toThrow(
      NotFoundException,
    );
  });

  it("propagates repository errors", async () => {
    const repo = makeRepo();
    (repo.delete as Mock).mockRejectedValue(new Error("db down"));
    const service = new DraftArchiveService(repo);

    await expect(service.archive({ formId: "x" })).rejects.toThrow(/db down/);
  });
});

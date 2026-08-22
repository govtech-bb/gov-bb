import type { Mocked } from "vitest";
import { CatchmentContactService } from "./catchment-contact.service";
import type { CatchmentContactRepository } from "./catchment-contact.repository";
import type { CatchmentContactEntity } from "@/database/entities/catchment-contact.entity";

function makeService(row: Partial<CatchmentContactEntity> | null) {
  const repo = {
    findOne: vi.fn().mockResolvedValue(row),
  } as unknown as Mocked<CatchmentContactRepository>;
  return { service: new CatchmentContactService(repo), repo };
}

describe("CatchmentContactService.resolveMdaEmail", () => {
  it("returns the mda_email for the serving catchment", async () => {
    const { service, repo } = makeService({
      catchmentName: "St. Philip Polyclinic",
      mdaEmail: "eh-st-philip@gov.bb",
    });

    await expect(
      service.resolveMdaEmail("St. Philip Polyclinic"),
    ).resolves.toBe("eh-st-philip@gov.bb");
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { catchmentName: "St. Philip Polyclinic" },
    });
  });

  it("returns null when the catchment has no row", async () => {
    const { service } = makeService(null);

    await expect(
      service.resolveMdaEmail("Branford Taitt Polyclinic"),
    ).resolves.toBeNull();
  });

  it("returns null when the row's mda_email is blank", async () => {
    const { service } = makeService({
      catchmentName: "Maurice Byer Polyclinic",
      mdaEmail: "",
    });

    await expect(
      service.resolveMdaEmail("Maurice Byer Polyclinic"),
    ).resolves.toBeNull();
  });
});

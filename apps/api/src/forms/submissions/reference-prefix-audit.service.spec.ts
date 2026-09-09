import { ReferencePrefixAuditService } from "./reference-prefix-audit.service";
import type { FormConfigService } from "@/forms/form-config/form-config.service";
import type { RecipeFileLoaderService } from "@/forms/form-definitions/recipe-file-loader.service";

function makeService(
  recipes: Record<string, string | undefined>,
  ministryKeys: Record<string, string>,
  formConfigOverride?: Partial<FormConfigService>,
) {
  const loader = {
    findAll: () => Object.keys(recipes).map((formId) => ({ formId })),
    findByFormId: ({ formId }: { formId: string }) => ({
      processors: [
        {
          type: "webhook",
          config: {
            mapping: {
              programmeCode: "X",
              ...(recipes[formId] ? { mdaCode: recipes[formId] } : {}),
            },
          },
        },
      ],
    }),
  } as unknown as RecipeFileLoaderService;

  const formConfig = {
    listMinistryKeysByForm: vi
      .fn()
      .mockResolvedValue(new Map(Object.entries(ministryKeys))),
    ...formConfigOverride,
  } as unknown as FormConfigService;

  return new ReferencePrefixAuditService(loader, formConfig);
}

describe("ReferencePrefixAuditService", () => {
  it("records no issues when the declared MDA codes are consistent", async () => {
    const service = makeService(
      { "temp-licence": "MOH", "eho-request": "MOH", byac: "MYS" },
      { "temp-licence": "health", "eho-request": "health", byac: "youth" },
    );

    await service.onApplicationBootstrap();

    expect(service.issues).toEqual([]);
  });

  it("records an issue when one ministry's forms disagree", async () => {
    const service = makeService(
      { "temp-licence": "MOH", "eho-request": "MHO" },
      { "temp-licence": "health", "eho-request": "health" },
    );

    await service.onApplicationBootstrap();

    expect(service.issues).toHaveLength(1);
    expect(service.issues[0]).toContain("health");
  });

  it("does not throw when mda_contact cannot be read at boot", async () => {
    const service = makeService({ "temp-licence": "MOH" }, {}, {
      listMinistryKeysByForm: vi
        .fn()
        .mockRejectedValue(new Error("connection refused")),
    } as unknown as Partial<FormConfigService>);

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(service.issues).toEqual([]);
  });
});

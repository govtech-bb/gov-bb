import { RegistryService } from "./registry.service";
import { UnknownRefError } from "@govtech-bb/form-builder";
import { CustomComponent } from "./entities/custom-component.entity";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import type { Block, ServiceContractRecipe } from "@govtech-bb/form-types";
import { Repository } from "typeorm";

function makeService(
  customComponents: Partial<CustomComponent>[] = [],
): RegistryService {
  const mockRepo = {
    find: vi.fn().mockResolvedValue(customComponents),
  } as unknown as Repository<CustomComponent>;
  return new RegistryService(mockRepo);
}

// RegistryService delegates recipe expansion to the shared `hydrateForm`
// (@govtech-bb/form-builder) after building a catalog from builtins + its
// DB-backed custom components. These tests exercise that public path.
describe("RegistryService", () => {
  const base: Omit<ServiceContractRecipe, "steps"> = {
    formId: "passport-renewal",
    title: "Passport Renewal",
    description: "Renew your passport",
    version: "1.0.0",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    processors: [],
  };

  describe("hydrateForm", () => {
    it("hydrates a recipe with component refs", async () => {
      const result = await makeService().hydrateForm({
        ...base,
        steps: [
          {
            stepId: "step-1",
            title: "Step 1",
            elements: [
              { ref: "components/first-name" as const },
              { ref: "components/last-name" as const },
            ],
          },
        ],
      });
      expect(result.steps[0].elements).toHaveLength(2);
    });

    it("applies primitive overrides during hydration", async () => {
      const result = await makeService().hydrateForm({
        ...base,
        steps: [
          {
            stepId: "step-1",
            title: "Step 1",
            elements: [
              {
                ref: "components/first-name" as const,
                overrides: { label: "Given Name" },
              },
            ],
          },
        ],
      });
      expect((result.steps[0].elements[0] as any).label).toBe("Given Name");
    });

    it("flattens a block's primitives into the step elements", async () => {
      const personalInfoBlock = BUILTIN_REGISTRY[
        "blocks/personal-information"
      ] as Block;
      const result = await makeService().hydrateForm({
        ...base,
        steps: [
          {
            stepId: "step-1",
            title: "Step 1",
            elements: [{ ref: "blocks/personal-information" as const }],
          },
        ],
      });
      // Block has N primitives — step must have exactly N elements, not 1 block
      expect(result.steps[0].elements).toHaveLength(
        personalInfoBlock.elements.length,
      );
      // Each element must be a Primitive (has fieldId, not blockId)
      for (const el of result.steps[0].elements) {
        expect(el).toHaveProperty("fieldId");
        expect(el).not.toHaveProperty("blockId");
      }
    });

    it("applies block-level field overrides and flattens during hydration", async () => {
      const result = await makeService().hydrateForm({
        ...base,
        steps: [
          {
            stepId: "step-1",
            title: "Step 1",
            elements: [
              {
                ref: "blocks/personal-information" as const,
                overrides: { "first-name": { label: "Given Name" } },
              },
            ],
          },
        ],
      });
      const firstNameEl = result.steps[0].elements.find(
        (el) => el.fieldId === "first-name",
      );
      expect(firstNameEl).toBeDefined();
      expect((firstNameEl as any).label).toBe("Given Name");
    });

    it("flattens mixed component and block refs into a single elements array", async () => {
      const personalInfoBlock = BUILTIN_REGISTRY[
        "blocks/personal-information"
      ] as Block;
      const result = await makeService().hydrateForm({
        ...base,
        steps: [
          {
            stepId: "step-1",
            title: "Step 1",
            elements: [
              { ref: "components/email" as const },
              { ref: "blocks/personal-information" as const },
            ],
          },
        ],
      });
      // 1 component + N block elements
      expect(result.steps[0].elements).toHaveLength(
        1 + personalInfoBlock.elements.length,
      );
    });

    it("hydrates a show-hide ref and applies field overrides", async () => {
      const result = await makeService().hydrateForm({
        ...base,
        steps: [
          {
            stepId: "step-1",
            title: "Step 1",
            elements: [
              {
                ref: "components/show-hide" as const,
                overrides: {
                  label: "Show advanced options",
                  hint: "Reveals extra fields",
                  fieldId: "show-advanced",
                },
              },
            ],
          },
        ],
      });
      const el = result.steps[0].elements[0] as any;
      expect(el.label).toBe("Show advanced options");
      expect(el.hint).toBe("Reveals extra fields");
      expect(el.fieldId).toBe("show-advanced");
      expect(el.htmlType).toBe("show-hide");
    });

    it("throws UnknownRefError for an unknown ref", async () => {
      await expect(
        makeService().hydrateForm({
          ...base,
          steps: [
            {
              stepId: "step-1",
              title: "Step 1",
              elements: [{ ref: "components/ghost" as const }],
            },
          ],
        }),
      ).rejects.toThrow(UnknownRefError);
    });

    it("hydrates a recipe referencing a DB-backed custom component", async () => {
      const service = makeService([
        {
          namespace: "barbados",
          type: "next-of-kin",
          definition: {
            fieldId: "next-of-kin",
            label: "Next of Kin",
            htmlType: "text",
          } as Record<string, unknown>,
        },
      ]);
      const result = await service.hydrateForm({
        ...base,
        steps: [
          {
            stepId: "step-1",
            title: "Step 1",
            elements: [{ ref: "components/barbados/next-of-kin" as const }],
          },
        ],
      });
      expect((result.steps[0].elements[0] as any).fieldId).toBe("next-of-kin");
      expect((result.steps[0].elements[0] as any).label).toBe("Next of Kin");
    });

    it("reuses the cached catalog and does not hit the database twice", async () => {
      const mockRepo = {
        find: vi.fn().mockResolvedValue([]),
      } as unknown as Repository<CustomComponent>;
      const service = new RegistryService(mockRepo);

      const recipe: ServiceContractRecipe = {
        ...base,
        steps: [
          {
            stepId: "step-1",
            title: "Step 1",
            elements: [{ ref: "components/first-name" }],
          },
        ],
      };

      await service.hydrateForm(recipe); // warms the catalog cache
      await service.hydrateForm(recipe); // second call must reuse the cache

      expect(mockRepo.find).toHaveBeenCalledTimes(1);
    });

    // Parity guard (#2024): the shared hydrateForm must carry the fields the
    // pre-consolidation API resolver carried — conditionalTitle, markdownContent,
    // closingDateTime — and preserve the recipe's own timestamps.
    it("carries all API-parity fields for a representative recipe", async () => {
      const conditionalTitle = [
        {
          targetStepId: "applying-for-yourself",
          targetFieldId: "applying-for-yourself",
          operator: "equal" as const,
          value: "yes",
          title: "Provide your birth details",
        },
      ];
      const result = await makeService().hydrateForm({
        ...base,
        createdAt: "2025-03-04T09:00:00Z",
        updatedAt: "2025-06-11T14:30:00Z",
        meta: {
          visibility: "public",
          closingDateTime: "2026-07-09T23:59:00-04:00",
        },
        steps: [
          {
            stepId: "birth-details",
            title: "Provide the person's birth details",
            conditionalTitle,
            markdownContent: "## What you need to know\n\nContact us.",
            elements: [{ ref: "components/first-name" as const }],
          },
        ],
      });

      expect(result.createdAt).toBe("2025-03-04T09:00:00Z");
      expect(result.updatedAt).toBe("2025-06-11T14:30:00Z");
      expect(result.closingDateTime).toBe("2026-07-09T23:59:00-04:00");
      expect(result.steps[0].conditionalTitle).toEqual(conditionalTitle);
      expect(result.steps[0].markdownContent).toBe(
        "## What you need to know\n\nContact us.",
      );
    });
  });
});

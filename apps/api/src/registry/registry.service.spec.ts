import {
  RegistryService,
  UnresolvableComponentError,
} from "./registry.service";
import { mergeEntry, hydrateStep, hydrateForm } from "./resolution";
import { CustomComponent } from "./entities/custom-component.entity";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import type { Block, ServiceContractRecipe } from "@govtech-bb/form-types";
import type { Primitive } from "@govtech-bb/form-types";
import { Repository } from "typeorm";

function makeService(
  customComponents: Partial<CustomComponent>[] = [],
): RegistryService {
  const mockRepo = {
    find: jest.fn().mockResolvedValue(customComponents),
  } as unknown as Repository<CustomComponent>;
  return new RegistryService(mockRepo);
}

// ─── mergeEntry ────────────────────────────────────────────────────────────

describe("mergeEntry", () => {
  const primitiveEntry = BUILTIN_REGISTRY["components/first-name"] as Primitive;
  const blockEntry = BUILTIN_REGISTRY["blocks/personal-information"] as Block;

  it("returns a deep clone when no overrides provided", () => {
    const result = mergeEntry(primitiveEntry, { ref: "components/first-name" });
    expect(result).not.toBe(primitiveEntry);
    expect(result).toEqual(primitiveEntry);
  });

  it("does not mutate the original builtin", () => {
    const original = (primitiveEntry as any).label;
    mergeEntry(primitiveEntry, {
      ref: "components/first-name",
      overrides: { label: "Given Name" },
    });
    expect((primitiveEntry as any).label).toBe(original);
  });

  it("applies FieldOverrides onto a primitive", () => {
    const result = mergeEntry(primitiveEntry, {
      ref: "components/first-name",
      overrides: { label: "Given Name", hint: "As on your passport" },
    });
    expect((result as any).label).toBe("Given Name");
    expect((result as any).hint).toBe("As on your passport");
    expect((result as any).fieldId).toBe("first-name");
  });

  it("applies field-keyed overrides onto a block", () => {
    const result = mergeEntry(blockEntry, {
      ref: "blocks/personal-information",
      overrides: { "first-name": { label: "Given Name" } },
    }) as Block;

    const firstNameEl = result.elements.find(
      (el) => el.fieldId === "first-name",
    );
    expect((firstNameEl as any).label).toBe("Given Name");
  });

  it("leaves unspecified block elements unchanged", () => {
    const result = mergeEntry(blockEntry, {
      ref: "blocks/personal-information",
      overrides: { "first-name": { label: "Given Name" } },
    }) as Block;

    const lastNameEl = result.elements.find((el) => el.fieldId === "last-name");
    const original = blockEntry.elements.find(
      (el) => el.fieldId === "last-name",
    );
    expect((lastNameEl as any).label).toBe((original as any).label);
  });

  it("does not mutate the original block elements", () => {
    const originalLabel = (blockEntry.elements[0] as any).label;
    mergeEntry(blockEntry, {
      ref: "blocks/personal-information",
      overrides: { [blockEntry.elements[0].fieldId]: { label: "Changed" } },
    });
    expect((blockEntry.elements[0] as any).label).toBe(originalLabel);
  });
});

// ─── hydrateStep ───────────────────────────────────────────────────────────

describe("hydrateStep", () => {
  const primitiveEntry = BUILTIN_REGISTRY["components/first-name"];
  const blockEntry = BUILTIN_REGISTRY["blocks/personal-information"] as Block;

  it("resolves all elements in a step", async () => {
    const resolver = jest.fn().mockResolvedValue(primitiveEntry);
    const result = await hydrateStep(
      {
        stepId: "step-1",
        title: "Step 1",
        elements: [{ ref: "components/first-name" }],
      },
      resolver,
    );
    expect(result.elements).toHaveLength(1);
    expect(resolver).toHaveBeenCalledWith("components/first-name");
  });

  it("flattens a block ref into its constituent primitives", async () => {
    const resolver = jest.fn().mockResolvedValue(blockEntry);
    const result = await hydrateStep(
      {
        stepId: "step-1",
        title: "Step 1",
        elements: [{ ref: "blocks/personal-information" }],
      },
      resolver,
    );
    expect(result.elements).toHaveLength(blockEntry.elements.length);
    expect(result.elements[0]).toHaveProperty("fieldId");
    expect(result.elements[0]).not.toHaveProperty("blockId");
  });

  it("throws UnresolvableComponentError for an unknown ref", async () => {
    const resolver = jest.fn().mockResolvedValue(null);
    await expect(
      hydrateStep(
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [{ ref: "components/unknown" }],
        },
        resolver,
      ),
    ).rejects.toThrow(UnresolvableComponentError);
  });
});

// ─── hydrateForm ───────────────────────────────────────────────────────────

describe("hydrateForm", () => {
  const resolver = jest
    .fn()
    .mockResolvedValue(BUILTIN_REGISTRY["components/first-name"]);

  const baseRecipe: ServiceContractRecipe = {
    formId: "test-form",
    title: "Test Form",
    description: "A test",
    version: "1.0.0",
    createdAt: "2026-01-01T00:00:00",
    updatedAt: "2026-01-01T00:00:00",
    processors: [],
    steps: [
      {
        stepId: "step-1",
        title: "Step 1",
        elements: [{ ref: "components/first-name" }],
      },
    ],
  };

  it("returns a fully hydrated ServiceContract", async () => {
    const result = await hydrateForm(baseRecipe, resolver);
    expect(result.formId).toBe("test-form");
    expect(result.steps[0].elements).toHaveLength(1);
  });

  it("preserves metadata from the recipe", async () => {
    const result = await hydrateForm(baseRecipe, resolver);
    expect(result.version).toBe("1.0.0");
    expect(result.createdAt).toBe("2026-01-01T00:00:00");
  });

  it("carries contactDetails through to the served contract (issue #452 dead-feature fix)", async () => {
    const contactDetails = {
      title: "Ministry of Health",
      telephoneNumber: "+1 246 555 0100",
      email: "health@gov.bb",
      address: { line1: "Jemmotts Lane", city: "Bridgetown" },
    };
    const result = await hydrateForm(
      { ...baseRecipe, contactDetails },
      resolver,
    );
    expect(result.contactDetails).toEqual(contactDetails);
  });

  it("leaves contactDetails undefined when the recipe has none", async () => {
    const result = await hydrateForm(baseRecipe, resolver);
    expect(result.contactDetails).toBeUndefined();
  });
});

// ─── RegistryService ───────────────────────────────────────────────────────

describe("RegistryService", () => {
  describe("resolve", () => {
    it("returns a built-in component by ref", async () => {
      const result = await makeService().resolve("components/first-name");
      expect((result as any).fieldId).toBe("first-name");
    });

    it("returns a built-in block by ref", async () => {
      const result = await makeService().resolve("blocks/personal-information");
      expect((result as any).blockId).toBe("personal-information");
    });

    it("returns the show-hide builtin by ref", async () => {
      const result = await makeService().resolve("components/show-hide");
      expect(result).not.toBeNull();
      expect((result as any).fieldId).toBe("show-hide");
      expect((result as any).htmlType).toBe("show-hide");
    });

    it("returns null for an unknown ref", async () => {
      expect(
        await makeService().resolve("components/does-not-exist"),
      ).toBeNull();
    });

    it("loads a custom component from the database", async () => {
      const definition = {
        fieldId: "next-of-kin",
        label: "Next of Kin",
        htmlType: "text",
      };
      const service = makeService([
        {
          namespace: "barbados",
          type: "next-of-kin",
          definition: definition as Record<string, unknown>,
        },
      ]);
      const result = await service.resolve("components/barbados/next-of-kin");
      expect((result as any).fieldId).toBe("next-of-kin");
    });

    it("uses the in-memory cache and skips the database on the second call", async () => {
      // Branch: `if (this.cache.has(CACHE_LOADED_KEY)) return` — cache already warm
      const mockRepo = {
        find: jest.fn().mockResolvedValue([
          {
            namespace: "barbados",
            type: "passport-type",
            definition: {
              fieldId: "passport-type",
              label: "Type",
              htmlType: "text",
            },
          },
        ]),
      } as unknown as Repository<CustomComponent>;
      const service = new RegistryService(mockRepo);

      // First call — warms the cache (calls repo.find once)
      await service.resolve("components/barbados/passport-type");
      // Second call — cache is warm, should NOT call repo.find again
      await service.resolve("components/barbados/passport-type");

      expect(mockRepo.find).toHaveBeenCalledTimes(1);
    });
  });

  describe("hydrateForm", () => {
    const base: Omit<ServiceContractRecipe, "steps"> = {
      formId: "passport-renewal",
      title: "Passport Renewal",
      description: "Renew your passport",
      version: "1.0.0",
      createdAt: "2026-01-01T00:00:00",
      updatedAt: "2026-01-01T00:00:00",
      processors: [],
    };

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

    it("throws UnresolvableComponentError for an unknown ref", async () => {
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
      ).rejects.toThrow(UnresolvableComponentError);
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
  });
});

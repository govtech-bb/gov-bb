import { RegistryService, UnresolvableComponentError } from './registry.service';
import { mergeEntry, hydrateStep, hydrateForm } from './resolution';
import { CustomComponent } from './entities/custom-component.entity';
import { BUILTIN_REGISTRY } from './builtins';
import type { Block } from './types/block.type';
import type { Primitive } from './types/primitive.type';
import { Repository } from 'typeorm';

function makeService(customComponents: Partial<CustomComponent>[] = []): RegistryService {
  const mockRepo = {
    find: jest.fn().mockResolvedValue(customComponents),
  } as unknown as Repository<CustomComponent>;
  return new RegistryService(mockRepo);
}

// ─── mergeEntry ────────────────────────────────────────────────────────────

describe('mergeEntry', () => {
  const primitiveEntry = BUILTIN_REGISTRY['components/first-name'] as Primitive;
  const blockEntry = BUILTIN_REGISTRY['blocks/personal-information'] as Block;

  it('returns a deep clone when no overrides provided', () => {
    const result = mergeEntry(primitiveEntry, { ref: 'components/first-name' });
    expect(result).not.toBe(primitiveEntry);
    expect(result).toEqual(primitiveEntry);
  });

  it('does not mutate the original builtin', () => {
    const original = (primitiveEntry as any).label;
    mergeEntry(primitiveEntry, { ref: 'components/first-name', overrides: { label: 'Given Name' } });
    expect((primitiveEntry as any).label).toBe(original);
  });

  it('applies FieldOverrides onto a primitive', () => {
    const result = mergeEntry(primitiveEntry, {
      ref: 'components/first-name',
      overrides: { label: 'Given Name', hint: 'As on your passport' },
    });
    expect((result as any).label).toBe('Given Name');
    expect((result as any).hint).toBe('As on your passport');
    expect((result as any).fieldId).toBe('first-name');
  });

  it('applies field-keyed overrides onto a block', () => {
    const result = mergeEntry(blockEntry, {
      ref: 'blocks/personal-information',
      overrides: { 'first-name': { label: 'Given Name' } },
    }) as Block;

    const firstNameEl = result.elements.find((el) => el.fieldId === 'first-name');
    expect((firstNameEl as any).label).toBe('Given Name');
  });

  it('leaves unspecified block elements unchanged', () => {
    const result = mergeEntry(blockEntry, {
      ref: 'blocks/personal-information',
      overrides: { 'first-name': { label: 'Given Name' } },
    }) as Block;

    const lastNameEl = result.elements.find((el) => el.fieldId === 'last-name');
    const original = blockEntry.elements.find((el) => el.fieldId === 'last-name');
    expect((lastNameEl as any).label).toBe((original as any).label);
  });

  it('does not mutate the original block elements', () => {
    const originalLabel = (blockEntry.elements[0] as any).label;
    mergeEntry(blockEntry, {
      ref: 'blocks/personal-information',
      overrides: { [blockEntry.elements[0].fieldId]: { label: 'Changed' } },
    });
    expect((blockEntry.elements[0] as any).label).toBe(originalLabel);
  });
});

// ─── hydrateStep ───────────────────────────────────────────────────────────

describe('hydrateStep', () => {
  const primitiveEntry = BUILTIN_REGISTRY['components/first-name'];

  it('resolves all elements in a step', async () => {
    const resolver = jest.fn().mockResolvedValue(primitiveEntry);
    const result = await hydrateStep(
      { stepId: 'step-1', title: 'Step 1', elements: [{ ref: 'components/first-name' }] },
      resolver,
    );
    expect(result.elements).toHaveLength(1);
    expect(resolver).toHaveBeenCalledWith('components/first-name');
  });

  it('throws UnresolvableComponentError for an unknown ref', async () => {
    const resolver = jest.fn().mockResolvedValue(null);
    await expect(
      hydrateStep(
        { stepId: 'step-1', title: 'Step 1', elements: [{ ref: 'components/unknown' }] },
        resolver,
      ),
    ).rejects.toThrow(UnresolvableComponentError);
  });
});

// ─── hydrateForm ───────────────────────────────────────────────────────────

describe('hydrateForm', () => {
  const resolver = jest.fn().mockResolvedValue(BUILTIN_REGISTRY['components/first-name']);

  const baseRecipe = {
    formId: 'test-form',
    title: 'Test Form',
    description: 'A test',
    version: '1.0.0',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    processors: [],
    steps: [
      { stepId: 'step-1', title: 'Step 1', elements: [{ ref: 'components/first-name' as const }] },
    ],
  };

  it('returns a fully hydrated ServiceContract', async () => {
    const result = await hydrateForm(baseRecipe, resolver);
    expect(result.formId).toBe('test-form');
    expect(result.steps[0].elements).toHaveLength(1);
  });

  it('preserves metadata from the recipe', async () => {
    const result = await hydrateForm(baseRecipe, resolver);
    expect(result.version).toBe('1.0.0');
    expect(result.createdAt).toEqual(new Date('2026-01-01'));
  });
});

// ─── RegistryService ───────────────────────────────────────────────────────

describe('RegistryService', () => {
  describe('resolve', () => {
    it('returns a built-in component by ref', async () => {
      const result = await makeService().resolve('components/first-name');
      expect((result as any).fieldId).toBe('first-name');
    });

    it('returns a built-in block by ref', async () => {
      const result = await makeService().resolve('blocks/personal-information');
      expect((result as any).blockId).toBe('personal-information');
    });

    it('returns null for an unknown ref', async () => {
      expect(await makeService().resolve('components/does-not-exist')).toBeNull();
    });

    it('loads a custom component from the database', async () => {
      const definition = { fieldId: 'next-of-kin', label: 'Next of Kin', htmlType: 'text' };
      const service = makeService([
        { namespace: 'barbados', type: 'next-of-kin', definition: definition as Record<string, unknown> },
      ]);
      const result = await service.resolve('components/barbados/next-of-kin');
      expect((result as any).fieldId).toBe('next-of-kin');
    });
  });

  describe('hydrateForm', () => {
    const base = {
      formId: 'passport-renewal',
      title: 'Passport Renewal',
      description: 'Renew your passport',
      version: '1.0.0',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      processors: [],
    };

    it('hydrates a recipe with component refs', async () => {
      const result = await makeService().hydrateForm({
        ...base,
        steps: [
          {
            stepId: 'step-1',
            title: 'Step 1',
            elements: [
              { ref: 'components/first-name' as const },
              { ref: 'components/last-name' as const },
            ],
          },
        ],
      });
      expect(result.steps[0].elements).toHaveLength(2);
    });

    it('applies primitive overrides during hydration', async () => {
      const result = await makeService().hydrateForm({
        ...base,
        steps: [
          {
            stepId: 'step-1',
            title: 'Step 1',
            elements: [
              { ref: 'components/first-name' as const, overrides: { label: 'Given Name' } },
            ],
          },
        ],
      });
      expect((result.steps[0].elements[0] as any).label).toBe('Given Name');
    });

    it('applies block-level field overrides during hydration', async () => {
      const result = await makeService().hydrateForm({
        ...base,
        steps: [
          {
            stepId: 'step-1',
            title: 'Step 1',
            elements: [
              {
                ref: 'blocks/personal-information' as const,
                overrides: { 'first-name': { label: 'Given Name' } },
              },
            ],
          },
        ],
      });
      const block = result.steps[0].elements[0] as Block;
      const firstNameEl = block.elements.find((el) => el.fieldId === 'first-name');
      expect((firstNameEl as any).label).toBe('Given Name');
    });

    it('throws UnresolvableComponentError for an unknown ref', async () => {
      await expect(
        makeService().hydrateForm({
          ...base,
          steps: [
            { stepId: 'step-1', title: 'Step 1', elements: [{ ref: 'components/ghost' as const }] },
          ],
        }),
      ).rejects.toThrow(UnresolvableComponentError);
    });
  });
});

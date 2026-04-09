# Registry Module

## How it works

A **Recipe** stores form definitions as lightweight refs. The registry resolves each ref into its full definition and returns a hydrated **Schema**.

```
Recipe (refs)  →  registry.hydrateForm()  →  Schema (full definitions)
```

Resolution order for each ref:
1. Check built-in map (always in-memory)
2. Check custom component cache (60s TTL) — miss triggers a DB reload
3. Neither found → `UnresolvableComponentError`

Once found, overrides are merged via `mergeEntry()` — a deep clone ensures builtins are never mutated.

## Usage

Inject `RegistryService` into any module that needs to resolve or hydrate forms.

```typescript
import { RegistryModule } from './registry/registry.module';

@Module({ imports: [RegistryModule] })
export class FormsModule {}
```

```typescript
constructor(private readonly registry: RegistryService) {}

// Resolve a single ref
const field = await this.registry.resolve('components/first-name');

// Hydrate a full recipe into a schema
const schema = await this.registry.hydrateForm(recipe);
```

## Overrides

```typescript
// Component — override display fields directly
{ ref: 'components/national-id', overrides: { label: 'National Registration Number' } }

// Block — target individual fields within the block by fieldId
{ ref: 'blocks/physical-address', overrides: { town: { label: 'City or Town' } } }
```

`fieldId` and `htmlType` cannot be overridden.

# Registry Module

## How it works

A **Recipe** stores form definitions as lightweight refs. The registry resolves each ref into its full definition and returns a hydrated **Schema**.

```
Recipe (refs)  →  registry.hydrateForm()  →  Schema (full definitions)
```

Resolution order for each ref (`getRegistryItem`, @govtech-bb/form-builder):
1. Catalog components/blocks (empty on the server — reserved for the builder)
2. DB-backed custom components, 60s TTL cache (`components/<namespace>/<type>`)
3. Built-in registry fallback (`REGISTRY_COMPONENTS` / `REGISTRY_BLOCKS`)
4. None matched → `UnknownRefError`, listing every unresolvable ref and its recipe path

Overrides are merged via `applyFieldOverrides` (@govtech-bb/form-types), which
deep-merges `validations` and `ui` over the registry defaults. Each element is
`structuredClone`d first, so a hydrated contract never aliases the built-in
registry singletons.

## Usage

Inject `RegistryService` into any module that needs to resolve or hydrate forms.

```typescript
import { RegistryModule } from './registry/registry.module';

@Module({ imports: [RegistryModule] })
export class FormsModule {}
```

```typescript
constructor(private readonly registry: RegistryService) {}

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

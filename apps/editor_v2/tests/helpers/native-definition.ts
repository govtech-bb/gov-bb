import { validateFormDefinition, type NativeSchemaCapabilities } from "../../src/forms/schema";

export function nativeDefinition(value: unknown, capabilities?: NativeSchemaCapabilities) {
  const result = validateFormDefinition(value, capabilities);

  if (result.status !== "ready")
    throw Error(`Invalid native fixture: ${JSON.stringify(result.diagnostics)}`);

  return result.schema;
}

export type NativePath = readonly (string | number)[];

export type NativeDiagnostic = {
  code: string;
  severity: "error" | "warning";
  message: string;
  path: NativePath;
  blockId?: string;
};

export function nativeDiagnostic(
  code: string,
  message: string,
  path: NativePath,
  blockId?: string,
): NativeDiagnostic {
  const diagnostic: NativeDiagnostic = { code, severity: "error", message, path: [...path] };

  if (blockId !== undefined) diagnostic.blockId = blockId;

  return diagnostic;
}

export function hasNativeErrors(diagnostics: readonly NativeDiagnostic[]): boolean {
  return diagnostics.some((issue) => issue.severity === "error");
}

/** JSON pointer escaping makes paths unambiguous even for extension keys containing / or ~. */
export function nativeDiagnosticPath(path: NativePath): string {
  return path.length
    ? `/${path.map((item) => String(item).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`
    : "/";
}

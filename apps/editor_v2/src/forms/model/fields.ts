import type { Comparison } from "./logic";

export type FieldStorage = {
  readonly type: string;
  readonly property?: string;
  readonly value?: string;
  readonly defaultValue?: string;
};

export type FieldCapabilities = {
  readonly hideLabel: boolean;
  readonly repeat: boolean;
  readonly width?: "short" | "medium" | "long";
  readonly comparisons: readonly Comparison[];
  readonly formula: boolean;
  readonly mention?: boolean;
  readonly multiple?: boolean;
};

export type FieldIssue = { code: string; message: string; where: string };

export type FieldReference = {
  kind: "field" | "option" | "page" | "block";
  value: string;
  path: readonly (string | number)[];
};

export type ReferenceVisitor = (reference: FieldReference) => string;

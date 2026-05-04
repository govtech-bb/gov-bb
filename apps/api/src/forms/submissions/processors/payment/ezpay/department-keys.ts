import { z } from "zod";

const departmentKeysSchema = z.record(z.string(), z.string());

export class DepartmentKeyResolver {
  constructor(private readonly map: Record<string, string>) {}

  static fromJson(raw: string): DepartmentKeyResolver {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error("EZPAY_DEPARTMENT_API_KEYS is not valid JSON", {
        cause: err,
      });
    }
    const result = departmentKeysSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `EZPAY_DEPARTMENT_API_KEYS shape invalid: ${result.error.message}`,
      );
    }
    return new DepartmentKeyResolver(result.data);
  }

  get(department: string): string {
    const key = this.map[department] ?? this.map.default;
    if (!key)
      throw new Error(
        `No EzPay API key configured for department "${department}"`,
      );
    return key;
  }

  departments(): string[] {
    return Object.keys(this.map).filter((d) => d !== "default");
  }
}

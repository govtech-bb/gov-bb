export class DepartmentKeyResolver {
  constructor(private readonly map: Record<string, string>) {}

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

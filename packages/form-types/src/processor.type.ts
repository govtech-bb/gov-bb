export interface Processor {
  type: "email" | "payment" | "opencrvs";
  config: Record<string, string | number>;
}

import z from "zod";

export const processorSchema = z.object({
  type: z.enum(["email", "opencrvs", "spreadsheet"]),
  config: z.record(z.string(), z.union([z.string(), z.number()])),
});
export type Processor = z.infer<typeof processorSchema>;

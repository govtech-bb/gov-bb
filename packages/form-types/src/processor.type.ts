import z from "zod";

const emailProcessorSchema = z.object({
  type: z.literal("email"),
  config: z.record(z.string(), z.union([z.string(), z.number()])),
});

const opencrvsProcessorSchema = z.object({
  type: z.literal("opencrvs"),
  config: z.record(z.string(), z.union([z.string(), z.number()])),
});

const spreadsheetProcessorSchema = z.object({
  type: z.literal("spreadsheet"),
  config: z.record(z.string(), z.union([z.string(), z.number()])),
});

const paymentProcessorConfigSchema = z.object({
  provider: z.literal("ezpay"),
  department: z.string().min(1),
  paymentCode: z.string().min(1),
  amount: z.number().positive(),
  description: z.string().min(1),
  customerEmailPath: z.string().min(1),
  customerNamePath: z.string().min(1),
  allowCredit: z.boolean().optional(),
  allowDebit: z.boolean().optional(),
  allowPayce: z.boolean().optional(),
});

const paymentProcessorSchema = z.object({
  type: z.literal("payment"),
  config: paymentProcessorConfigSchema,
});

export const processorSchema = z.discriminatedUnion("type", [
  emailProcessorSchema,
  opencrvsProcessorSchema,
  spreadsheetProcessorSchema,
  paymentProcessorSchema,
]);

export type Processor = z.infer<typeof processorSchema>;
export type PaymentProcessorConfig = z.infer<
  typeof paymentProcessorConfigSchema
>;

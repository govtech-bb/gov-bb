import z from "zod";
export declare const processorSchema: z.ZodObject<
  {
    type: z.ZodEnum<{
      email: "email";
      payment: "payment";
      opencrvs: "opencrvs";
    }>;
    config: z.ZodRecord<
      z.ZodString,
      z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>
    >;
  },
  z.core.$strip
>;
export type Processor = z.infer<typeof processorSchema>;

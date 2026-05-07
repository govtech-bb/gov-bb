import { z, ZodType } from "zod";

const jsonLogicRuleSchema = z.record(z.string(), z.unknown());

export const dynamic = <T extends ZodType>(literal: T) =>
  z.union([literal, jsonLogicRuleSchema]);

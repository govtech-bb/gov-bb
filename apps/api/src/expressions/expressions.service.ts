import { BadRequestException, Injectable } from "@nestjs/common";
import jsonLogic from "json-logic-js";
import type { Processor, ResolvedProcessor } from "@govtech-bb/form-types";
import { resolvedProcessorSchema } from "@govtech-bb/form-types";
import {
  resolveConfig,
  registerOperations,
  ResolutionContext,
} from "@govtech-bb/expressions";

let opsRegistered = false;

@Injectable()
export class ExpressionsService {
  constructor() {
    if (!opsRegistered) {
      registerOperations(jsonLogic);
      opsRegistered = true;
    }
  }

  resolveConfig(
    config: Record<string, unknown>,
    ctx: ResolutionContext,
  ): Record<string, unknown> {
    return resolveConfig(config, ctx);
  }

  /**
   * Resolves each processor's config against `ctx`, then validates the result
   * against `resolvedProcessorSchema`. A rule whose output violates the
   * resolved-time shape (e.g. amount → "abc") fails here with a typed Zod
   * error instead of crashing inside the processor.
   */
  resolveProcessors(
    processors: readonly Processor[],
    ctx: ResolutionContext,
  ): ResolvedProcessor[] {
    return processors.map((p, i) => {
      const resolved = {
        ...p,
        config: resolveConfig(p.config as Record<string, unknown>, ctx),
      };
      const parsed = resolvedProcessorSchema.safeParse(resolved);
      if (!parsed.success) {
        const detail = parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ");
        throw new BadRequestException(
          `Processor[${i}] (${p.type}) failed post-resolution validation: ${detail}`,
        );
      }
      return parsed.data;
    });
  }
}

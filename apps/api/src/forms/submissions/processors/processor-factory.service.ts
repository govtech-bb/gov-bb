import { Injectable, Inject, Logger } from "@nestjs/common";
import type { Processor } from "@govtech-bb/form-types";
import {
  ISubmissionProcessor,
  SUBMISSION_PROCESSORS,
} from "./submission-processor.interface";

@Injectable()
export class ProcessorFactory {
  private readonly logger = new Logger(ProcessorFactory.name);
  private readonly registry: Map<string, ISubmissionProcessor>;

  constructor(
    @Inject(SUBMISSION_PROCESSORS) processors: ISubmissionProcessor[],
  ) {
    this.registry = new Map(processors.map((p) => [p.type, p]));
  }

  /** Resolve a single processor by its string type — used by the SQS consumer
   *  to reconstruct the handler from a queue message. */
  resolveByType(type: string): ISubmissionProcessor | undefined {
    return this.registry.get(type);
  }

  /** Resolve the set of distinct handlers for these configs.
   *
   * Returns at most one handler per registered type, preserving first-seen
   * order. Used by the **gating** path (`submissions.service.ts`), where
   * single-instance, first-wins semantics are wanted (e.g. payment). Non-gating
   * dispatch no longer goes through here — it iterates `processors[]` by index
   * and resolves each entry via `resolveByType` (per-entry dispatch, issue #95).
   */
  resolve(processorConfigs: Processor[]): ISubmissionProcessor[] {
    const seen = new Set<string>();
    const handlers: ISubmissionProcessor[] = [];
    for (const cfg of processorConfigs) {
      if (seen.has(cfg.type)) continue;
      const handler = this.registry.get(cfg.type);
      if (!handler) {
        this.logger.warn(
          `No processor registered for type "${cfg.type}" — skipping`,
        );
        continue;
      }
      seen.add(cfg.type);
      handlers.push(handler);
    }
    return handlers;
  }

  resolveSplit(processorConfigs: Processor[]): {
    gating: ISubmissionProcessor[];
    nonGating: ISubmissionProcessor[];
  } {
    const resolved = this.resolve(processorConfigs);
    const gating: ISubmissionProcessor[] = [];
    const nonGating: ISubmissionProcessor[] = [];
    for (const p of resolved) {
      if (p.gatesPipeline) gating.push(p);
      else nonGating.push(p);
    }
    return { gating, nonGating };
  }
}

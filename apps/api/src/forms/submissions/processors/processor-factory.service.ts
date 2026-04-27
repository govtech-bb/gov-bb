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

  resolve(processorConfigs: Processor[]): ISubmissionProcessor[] {
    return processorConfigs.flatMap((cfg) => {
      const handler = this.registry.get(cfg.type);
      if (!handler) {
        this.logger.warn(
          `No processor registered for type "${cfg.type}" — skipping`,
        );
        return [];
      }
      return [handler];
    });
  }
}

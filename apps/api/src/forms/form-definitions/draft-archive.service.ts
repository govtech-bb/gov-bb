import { Injectable, Logger } from "@nestjs/common";
import { FormDefinitionRepository } from "./form-definition.repository";
import { AppError } from "@/common/errors";

@Injectable()
export class DraftArchiveService {
  private readonly logger = new Logger(DraftArchiveService.name);

  constructor(private readonly formDefRepo: FormDefinitionRepository) {}

  async archive({
    formId,
    version,
  }: {
    formId: string;
    version: string;
  }): Promise<void> {
    const result = await this.formDefRepo.delete({ formId, version });
    if (!result.affected || result.affected === 0) {
      throw AppError.notFound("Draft form definition", { formId, version });
    }
    this.logger.log(
      `Archived draft form definition (formId=${formId}, version=${version})`,
    );
  }
}

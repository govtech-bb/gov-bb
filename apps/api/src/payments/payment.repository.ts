import { Injectable } from "@nestjs/common";
import { DataSource, Repository } from "typeorm";
import { PaymentEntity } from "../database/entities/payment.entity";

@Injectable()
export class PaymentRepository {
  private readonly repo: Repository<PaymentEntity>;
  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(PaymentEntity);
  }

  async upsertBySubmission(draft: PaymentEntity): Promise<PaymentEntity> {
    const existing = await this.repo.findOne({
      where: { submissionId: draft.submissionId },
    });
    if (existing) return existing;
    return this.repo.save(draft);
  }

  findByReference(referenceNumber: string): Promise<PaymentEntity | null> {
    return this.repo.findOne({ where: { referenceNumber } });
  }

  save(p: PaymentEntity): Promise<PaymentEntity> {
    return this.repo.save(p);
  }
}

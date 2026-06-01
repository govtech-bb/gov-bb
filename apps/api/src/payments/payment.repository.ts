import { Injectable } from "@nestjs/common";
import { DataSource, In, Repository } from "typeorm";
import {
  PaymentEntity,
  PaymentStatus,
} from "../database/entities/payment.entity";

@Injectable()
export class PaymentRepository {
  private readonly repo: Repository<PaymentEntity>;
  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(PaymentEntity);
  }

  create(draft: Partial<PaymentEntity>): PaymentEntity {
    return this.repo.create(draft);
  }

  async findOrCreate(draft: PaymentEntity): Promise<PaymentEntity> {
    const existing = await this.repo.findOne({
      where: { submissionId: draft.submissionId },
    });
    if (existing) return existing;
    return this.repo.save(draft);
  }

  findByReference(referenceNumber: string): Promise<PaymentEntity | null> {
    return this.repo.findOne({ where: { referenceNumber } });
  }

  /**
   * Non-terminal payments that reconciliation should re-check with EzPay.
   * PENDING (created, citizen may still be paying) and INITIATED (provider
   * token issued) can still converge to success/failure; SUCCESS / FAILED /
   * CANCELLED / MISMATCHED / REFUNDED are terminal and left alone.
   */
  findReconcilable(): Promise<PaymentEntity[]> {
    return this.repo.find({
      where: { status: In([PaymentStatus.PENDING, PaymentStatus.INITIATED]) },
    });
  }

  save(p: PaymentEntity): Promise<PaymentEntity> {
    return this.repo.save(p);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DateTime } from 'luxon';
import { DraftStatus, FormDraftEntity } from '../../database/entities/form-draft.entity';
import { FormDefinitionEntity } from '../../database/entities/form-definition.entity';
import { FormDraftRepository } from './form-draft.repository';
import { AppError } from '../../common/errors';

const DRAFT_EXPIRY_DAYS = 7;

@Injectable()
export class FormDraftsService {
  private readonly logger = new Logger(FormDraftsService.name);

  constructor(
    private readonly draftRepo: FormDraftRepository,
    @InjectRepository(FormDefinitionEntity)
    private readonly formDefRepo: Repository<FormDefinitionEntity>,
  ) {}

  async create({
    draftId,
    formId,
    version,
    values = {},
    lastActivePage = 0,
  }: {
    draftId: string;
    formId: string;
    version?: string;
    values?: Record<string, unknown>;
    lastActivePage?: number;
  }): Promise<FormDraftEntity> {
    const existing = await this.draftRepo.findOne({ where: { draftId } });
    if (existing) return existing;

    // Pin the form version at creation time
    const formDef = await this.formDefRepo.findOne({
      where: { formId, ...(version && { version }) },
      order: { createdAt: 'DESC' },
    });
    if (!formDef) {
      throw AppError.notFound('Form definition', { formId, version });
    }

    const draft = this.draftRepo.create({
      draftId,
      formId,
      formVersion: formDef.version,
      values,
      lastActivePage,
      status: DraftStatus.ACTIVE,
      lastActiveAt: DateTime.utc().toJSDate(),
    });
    return this.draftRepo.save(draft);
  }

  async findById(draftId: string): Promise<FormDraftEntity> {
    const draft = await this.draftRepo.findOne({ where: { draftId } });
    if (!draft) throw AppError.notFound('Draft', draftId);
    return draft;
  }

  async update(
    draftId: string,
    {
      values,
      lastActivePage,
    }: { values?: Record<string, unknown>; lastActivePage?: number },
  ): Promise<FormDraftEntity> {
    const draft = await this.findById(draftId);
    if (draft.status === DraftStatus.ABANDONED) {
      throw AppError.badRequest('Cannot update an abandoned draft');
    }
    if (values !== undefined) draft.values = values;
    if (lastActivePage !== undefined) draft.lastActivePage = lastActivePage;
    draft.lastActiveAt = DateTime.utc().toJSDate();
    return this.draftRepo.save(draft);
  }

  async abandon(draftId: string): Promise<void> {
    const draft = await this.findById(draftId);
    draft.status = DraftStatus.ABANDONED;
    await this.draftRepo.save(draft);
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpired(): Promise<void> {
    const cutoff = DateTime.utc().minus({ days: DRAFT_EXPIRY_DAYS }).toJSDate();

    const abandoned = await this.draftRepo.delete({
      status: DraftStatus.ABANDONED,
      updatedAt: LessThan(cutoff),
    });
    const inactive = await this.draftRepo.delete({
      status: DraftStatus.ACTIVE,
      lastActiveAt: LessThan(cutoff),
    });

    const total = (abandoned.affected ?? 0) + (inactive.affected ?? 0);
    this.logger.log(`Cleaned up ${total} expired draft(s)`);
  }
}

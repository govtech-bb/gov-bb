import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormDefinitionEntity } from '../../database/entities/form-definition.entity';
import { FormDraftRepository } from './form-draft.repository';
import { FormDraftsService } from './form-drafts.service';
import { FormDraftsController } from './form-drafts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FormDefinitionEntity])],
  controllers: [FormDraftsController],
  providers: [FormDraftsService, FormDraftRepository],
  exports: [FormDraftsService],
})
export class FormDraftsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormDraftEntity } from '../../database/entities/form-draft.entity';
import { FormDefinitionEntity } from '../../database/entities/form-definition.entity';
import { FormDraftsService } from './form-drafts.service';
import { FormDraftsController } from './form-drafts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FormDraftEntity, FormDefinitionEntity])],
  controllers: [FormDraftsController],
  providers: [FormDraftsService],
  exports: [FormDraftsService],
})
export class FormDraftsModule {}

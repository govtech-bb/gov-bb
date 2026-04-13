import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';
import { FormSubmissionEntity } from '../../database/entities/form-submission.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FormSubmissionEntity])],
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}

import { Module } from '@nestjs/common';
import { FormVersionsController } from './form-versions.controller';
import { FormVersionsService } from './form-versions.service';

@Module({
  controllers: [FormVersionsController],
  providers: [FormVersionsService],
  exports: [FormVersionsService],
})
export class FormVersionsModule {}

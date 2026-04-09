import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegistryService } from './registry.service';
import { CustomComponent } from './entities/custom-component.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CustomComponent])],
  providers: [RegistryService],
  exports: [RegistryService],
})
export class RegistryModule {}

import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateSubmissionDto {
  @IsString()
  @IsNotEmpty()
  formId!: string;

  @IsString()
  @IsNotEmpty()
  formVersion!: string;

  @IsObject()
  values!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

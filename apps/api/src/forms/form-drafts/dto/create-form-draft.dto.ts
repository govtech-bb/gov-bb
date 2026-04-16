import { IsInt, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateFormDraftDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  draftId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  formId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  version?: string;

  @IsOptional()
  @IsObject()
  values?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  lastActivePage?: number;
}

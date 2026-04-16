import { IsInt, IsObject, IsOptional, Min } from "class-validator";

export class UpdateFormDraftDto {
  @IsOptional()
  @IsObject()
  values?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  lastActivePage?: number;
}

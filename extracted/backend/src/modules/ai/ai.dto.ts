import { IsArray, IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Request DTOs for the AI gateway. Validation rules are intentionally
 * conservative so misuse can't push large payloads through the LLM.
 */

export class AskDto {
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  question!: string;

  @IsOptional()
  context?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string;
}

export class ExplainDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fromName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  toName!: string;

  @IsOptional()
  @IsNumber()
  durationMinutes?: number;

  @IsOptional()
  @IsNumber()
  fareEgp?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehicle?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  steps?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string;
}

export class SuggestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fromName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  toName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  departAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string;
}

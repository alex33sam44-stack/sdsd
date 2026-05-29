import { IsBoolean, IsEmail, IsEnum, IsInt, IsISO8601, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { BillingInterval, BillingProvider } from '@prisma/client';

export class UpdateCurrentPlanDto {
  @IsOptional() @IsString() @MaxLength(64) code?: string;
  @IsOptional() @IsString() @MaxLength(32) status?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100000) seatLimit?: number | null;
  @IsOptional() @IsObject() limits?: Record<string, unknown> | null;
  @IsOptional() @IsObject() features?: Record<string, unknown> | null;
  @IsOptional() @IsISO8601() renewsAt?: string | null;
  @IsOptional() @IsEnum(BillingProvider) provider?: BillingProvider;
  @IsOptional() @IsEnum(BillingInterval) interval?: BillingInterval;
  @IsOptional() @IsInt() @Min(1) @Max(100000) seats?: number;
  @IsOptional() @IsISO8601() trialEndsAt?: string | null;
  @IsOptional() @IsISO8601() currentPeriodStart?: string | null;
  @IsOptional() @IsISO8601() currentPeriodEnd?: string | null;
  @IsOptional() @IsBoolean() cancelAtPeriodEnd?: boolean;
}

export class UpdateBillingProfileDto {
  @IsOptional() @IsEnum(BillingProvider) provider?: BillingProvider;
  @IsOptional() @IsEmail() @MaxLength(320) billingEmail?: string | null;
  @IsOptional() @IsString() @MaxLength(200) billingName?: string | null;
  @IsOptional() @IsString() @MaxLength(2) countryCode?: string | null;
  @IsOptional() @IsString() @MaxLength(64) taxId?: string | null;
  @IsOptional() @IsString() @MaxLength(3) currency?: string | null;
  @IsOptional() @IsObject() providerMetadata?: Record<string, unknown> | null;
}

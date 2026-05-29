import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  defaultStationId?: string;
}

import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
  @IsOptional() @IsString() displayName?: string;
}

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MaxLength(128) password!: string;
}

export class RefreshDto {
  @IsString() refreshToken!: string;
}

export class VerifyEmailDto {
  @IsString() @MinLength(16) token!: string;
}

export class ResendVerificationDto {
  @IsEmail() email!: string;
}

import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail() @MaxLength(200) email: string;
  @IsString() @MinLength(1) @MaxLength(200) password: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(200) currentPassword: string;
  @IsString() @MinLength(12) @MaxLength(128) newPassword: string;
}


export class ForgotPasswordDto {
  @IsEmail() @MaxLength(200) email: string;
}

export class ResetPasswordDto {
  @IsString() @MinLength(20) @MaxLength(200) token: string;
  @IsString() @MinLength(12) @MaxLength(128) newPassword: string;
}

export class MfaVerifyDto {
  @IsString() @MinLength(20) @MaxLength(1000) mfaToken: string;
  /** 6-digit authenticator code, or a recovery code (xxxxxx-xxxxxx). */
  @IsString() @MinLength(6) @MaxLength(20) code: string;
}

export class MfaCodeDto {
  @IsString() @MinLength(6) @MaxLength(20) code: string;
}

export class MfaDisableDto {
  @IsString() @MinLength(1) @MaxLength(200) password: string;
  @IsString() @MinLength(6) @MaxLength(20) code: string;
}

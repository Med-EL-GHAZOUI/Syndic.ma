import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail() @MaxLength(200) email: string;
  @IsString() @MinLength(1) @MaxLength(200) password: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(200) currentPassword: string;
  @IsString() @MinLength(12) @MaxLength(128) newPassword: string;
}

export class RefreshDto {
  @IsString() @MinLength(20) @MaxLength(200) refreshToken: string;
}

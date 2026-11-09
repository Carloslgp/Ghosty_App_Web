import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';

const between = (min: number, max: number) => ({ message: `entre ${min} e ${max} caracteres` });

export class AccountResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email', maxLength: 254 })
  email!: string;

  @ApiProperty({ minLength: 1, maxLength: 80 })
  displayName!: string;

  @ApiProperty({ description: 'Se o código secreto já foi definido' })
  secretCodeSet!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class CreateAccountRequest {
  @ApiProperty({ format: 'email', maxLength: 254, example: 'maria.exemplo@example.com' })
  @IsEmail({}, { message: 'e-mail inválido' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 1, maxLength: 80, example: 'Maria' })
  @IsString()
  @Length(1, 80, between(1, 80))
  displayName!: string;

  @ApiProperty({ format: 'password', minLength: 8, maxLength: 128 })
  @IsString()
  @Length(8, 128, between(8, 128))
  password!: string;
}

export class AuthenticateAccountRequest {
  @ApiProperty({ format: 'email', maxLength: 254 })
  @IsString()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ format: 'password', minLength: 1, maxLength: 128 })
  @IsString()
  @Length(1, 128, between(1, 128))
  password!: string;
}

export class UpdateAccountRequest {
  @ApiProperty({ minLength: 1, maxLength: 80 })
  @IsString()
  @Length(1, 80, between(1, 80))
  displayName!: string;
}

export class SetSecretCodeRequest {
  @ApiProperty({ format: 'password', minLength: 1, maxLength: 128 })
  @IsString()
  @Length(1, 128, between(1, 128))
  currentPassword!: string;

  @ApiProperty({ pattern: '^[0-9]{6,8}$', example: '246810' })
  @Matches(/^[0-9]{6,8}$/, { message: 'de 6 a 8 dígitos' })
  code!: string;
}

export class VerifySecretCodeRequest {
  @ApiProperty({ pattern: '^[0-9]{6,8}$' })
  @Matches(/^[0-9]{6,8}$/, { message: 'de 6 a 8 dígitos' })
  code!: string;
}

export class IssueRefreshTokenRequest {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'precisa ser um UUID' })
  accountId!: string;
}

export class RefreshTokenValue {
  @ApiProperty({ pattern: '^[A-Za-z0-9_-]{43}$' })
  @Matches(/^[A-Za-z0-9_-]{43}$/, { message: 'token inválido' })
  token!: string;
}

export class RefreshTokenResponse {
  @ApiProperty({ format: 'uuid' })
  accountId!: string;

  @ApiProperty({ pattern: '^[A-Za-z0-9_-]{43}$', description: 'Aparece uma única vez' })
  token!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';

const between = (min: number, max: number) => ({ message: `entre ${min} e ${max} caracteres` });

export class RegisterRequest {
  @ApiProperty({ minLength: 1, maxLength: 80, example: 'Maria' })
  @IsString()
  @Length(1, 80, between(1, 80))
  displayName!: string;

  @ApiProperty({ format: 'email', maxLength: 254, example: 'maria.exemplo@example.com' })
  @IsEmail({}, { message: 'e-mail inválido' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ format: 'password', minLength: 8, maxLength: 128 })
  @IsString()
  @Length(8, 128, between(8, 128))
  password!: string;
}

export class LoginRequest {
  @ApiProperty({ format: 'email', maxLength: 254 })
  @IsString()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ format: 'password', minLength: 1, maxLength: 128 })
  @IsString()
  @Length(1, 128, between(1, 128))
  password!: string;
}

export class RefreshRequest {
  @ApiProperty({ pattern: '^[A-Za-z0-9_-]{43}$' })
  @Matches(/^[A-Za-z0-9_-]{43}$/, { message: 'token inválido' })
  refreshToken!: string;
}

export class SessionUser {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty({ format: 'email' })
  email!: string;
}

export class AuthSessionResponse {
  @ApiProperty({ description: 'JWT de acesso (RS256)' })
  accessToken!: string;

  @ApiProperty({ enum: ['Bearer'] })
  tokenType!: string;

  @ApiProperty({ description: 'Segundos até o JWT vencer', example: 900 })
  expiresIn!: number;

  @ApiProperty({ pattern: '^[A-Za-z0-9_-]{43}$' })
  refreshToken!: string;

  @ApiProperty({ format: 'date-time' })
  refreshExpiresAt!: string;

  @ApiProperty({ type: SessionUser })
  user!: SessionUser;
}

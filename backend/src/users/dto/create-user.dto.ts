import {
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ROLES } from '../../auth/permissions';
import type { Role } from '../../auth/permissions';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  fullName: string;

  // Defaults to 'staff' if omitted (see UsersService.create).
  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  // Explicit per-user permissions; if omitted, seeded from the role's defaults.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsString()
  phone?: string;
}

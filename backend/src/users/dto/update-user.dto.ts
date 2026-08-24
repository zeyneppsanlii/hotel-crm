import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ALL_PERMISSIONS, ROLES } from '../../auth/permissions';
import type { Permission, Role } from '../../auth/permissions';

/**
 * Email is deliberately absent: it is the login identity, and changing it would
 * silently move the account. Passwords are not set here either.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  // Changing the role re-seeds the default permission set unless `permissions`
  // is sent alongside it (see UsersService.update).
  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @IsOptional()
  @IsArray()
  @IsIn(ALL_PERMISSIONS, { each: true })
  permissions?: Permission[];

  // Deactivation instead of deletion: an inactive user cannot log in.
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

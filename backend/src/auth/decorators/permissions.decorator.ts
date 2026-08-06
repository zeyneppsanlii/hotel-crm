import { SetMetadata } from '@nestjs/common';
import { Permission } from '../permissions';

/** Requires the caller to hold ALL listed permissions (admin bypasses). */
export const PERMISSIONS_KEY = 'required_permissions';
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

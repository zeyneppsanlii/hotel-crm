import { Role } from '../../auth/permissions';

/**
 * Branded (nominal) types: a bare `string` can't be passed where a specific id or
 * email is expected, which prevents mixing them up. At runtime they are plain
 * strings; the brand exists only at compile time. Build them with the helpers.
 */
type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId = Brand<string, 'UserId'>;
export type UserEmail = Brand<string, 'UserEmail'>;

export const toUserId = (value: string): UserId => value as UserId;
export const toUserEmail = (value: string): UserEmail => value as UserEmail;

/**
 * The data the repository needs to persist a new user. The tenant id is applied
 * by the tenant-aware layer, and the password arrives already hashed from the
 * service — so neither appears here.
 */
export interface NewUserRecord {
  email: string;
  passwordHash: string;
  fullName: string;
  role: Role;
  permissions: string[];
  phone?: string;
}

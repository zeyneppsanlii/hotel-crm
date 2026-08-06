/**
 * RBAC catalog. Permissions are `resource:action` strings checked by
 * PermissionsGuard. `role` is a coarse tier; `permissions` on the user row is the
 * fine-grained source of truth (two same-role users can differ). At user creation
 * the role seeds a default permission set (ROLE_DEFAULT_PERMISSIONS) which can then
 * be tuned per user. `admin` bypasses permission checks entirely (see the guard).
 */

export const PERMISSIONS = {
  GUESTS_VIEW: 'guests:view',
  GUESTS_EDIT: 'guests:edit',
  NETWORK_VIEW: 'network:view',
  NETWORK_EDIT: 'network:edit',
  TICKETS_VIEW: 'tickets:view',
  TICKETS_EDIT: 'tickets:edit',
  REPORTS_VIEW: 'reports:view',
  USERS_MANAGE: 'users:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export const ROLES = ['admin', 'manager', 'staff'] as const;
export type Role = (typeof ROLES)[number];

/**
 * Default permissions granted when a user is created with a given role, unless an
 * explicit `permissions` list is provided. `admin` bypasses checks in the guard,
 * so its list here is informational.
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL_PERMISSIONS,
  manager: [
    PERMISSIONS.GUESTS_VIEW,
    PERMISSIONS.GUESTS_EDIT,
    PERMISSIONS.TICKETS_VIEW,
    PERMISSIONS.TICKETS_EDIT,
    PERMISSIONS.NETWORK_VIEW,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.USERS_MANAGE,
  ],
  staff: [PERMISSIONS.GUESTS_VIEW, PERMISSIONS.TICKETS_VIEW],
};

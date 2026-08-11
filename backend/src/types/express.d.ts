import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

/**
 * Central augmentation of Express's types. Custom request properties are declared
 * ONCE here instead of repeating `Request & { ... }` at every use site. Compile-
 * time only — the values are populated at runtime by the respective middleware.
 *
 * Note: `req.user` is owned by @types/passport as `Express.User`, so we shape
 * THAT interface (not `Request.user`) to carry our authenticated-user fields.
 */
declare global {
  namespace Express {
    // Merges our authenticated-user fields into passport's `Express.User`.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends AuthenticatedUser {}

    interface Request {
      tenantId?: string;
      requestId?: string;
    }
  }
}

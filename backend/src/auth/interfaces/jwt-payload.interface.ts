/** Claims embedded in the signed JWT. One tenant per token (identity is per-tenant). */
export interface JwtPayload {
  sub: string; // user id
  email: string;
  tenantId: string;
  role: string;
  permissions: string[];
}

export interface RefreshTokenPayload {
  sub: string;
  tenantId: string;
  tokenType: 'refresh';
  jti: string;
}

/** Shape attached to `req.user` after JwtStrategy validates the token. */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  tenantId: string;
  role: string;
  permissions: string[];
}

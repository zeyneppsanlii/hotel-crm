export interface TokenSubject {
  id: string;
  email: string;
  tenantId: string;
  role: string;
  permissions: string[];
}

export interface AuthenticatedUserProfile {
  id: string;
  email: string;
  fullName: string;
  role: string;
  permissions: string[];
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUserProfile;
}

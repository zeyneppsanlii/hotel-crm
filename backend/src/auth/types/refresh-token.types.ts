import { Brand } from '../../common/types/brand';
import { TenantId } from '../../common/tenant/tenant.types';
import { UserId } from '../../users/types/user.types';

export type RefreshTokenId = Brand<string, 'RefreshTokenId'>;
export type RefreshTokenFamilyId = Brand<string, 'RefreshTokenFamilyId'>;
export type RefreshTokenHash = Brand<string, 'RefreshTokenHash'>;

export const toRefreshTokenId = (value: string): RefreshTokenId =>
  value as RefreshTokenId;

export const toRefreshTokenFamilyId = (value: string): RefreshTokenFamilyId =>
  value as RefreshTokenFamilyId;

export const toRefreshTokenHash = (value: string): RefreshTokenHash =>
  value as RefreshTokenHash;

export interface NewRefreshTokenRecord {
  userId: UserId;
  familyId: RefreshTokenFamilyId;
  tokenHash: RefreshTokenHash;
  expiresAt: Date;
}

export interface StoredRefreshToken {
  id: RefreshTokenId;
  userId: UserId;
  familyId: RefreshTokenFamilyId;
  expiresAt: Date;
}

export interface ConsumedRefreshToken {
  userId: UserId;
  tenantId: TenantId;
  familyId: RefreshTokenFamilyId;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

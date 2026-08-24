import { Brand } from '../../common/types/brand';
import { TenantId } from '../../common/tenant/tenant.types';
import { UserEmail } from '../../users/types/user.types';

export type ClientIp = Brand<string, 'ClientIp'>;

export const toClientIp = (value: string): ClientIp => value as ClientIp;

export interface LoginAttemptIdentity {
  tenantId: TenantId;
  email: UserEmail;
  ip: ClientIp;
}

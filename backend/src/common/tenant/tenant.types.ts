import { Brand } from '../types/brand';

export type TenantId = Brand<string, 'TenantId'>;

export const toTenantId = (value: string): TenantId => value as TenantId;

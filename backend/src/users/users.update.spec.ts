import { NotFoundException } from '@nestjs/common';
import { ROLE_DEFAULT_PERMISSIONS } from '../auth/permissions';
import { toUserId } from './types/user.types';
import { PublicUser, UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { UserUpdateRecord } from './types/user.types';

const USER_ID = toUserId('11111111-1111-1111-1111-111111111111');

describe('UsersService.update', () => {
  let captured: UserUpdateRecord;
  let service: UsersService;
  let found: boolean;

  beforeEach(() => {
    captured = undefined as unknown as UserUpdateRecord;
    found = true;
    const repository = {
      update: jest.fn((_id: string, data: UserUpdateRecord) => {
        captured = data;
        return Promise.resolve(
          found ? ({ id: USER_ID } as unknown as PublicUser) : null,
        );
      }),
    } as unknown as UsersRepository;
    service = new UsersService(repository);
  });

  it('re-seeds the role defaults when the role changes on its own', async () => {
    await service.update(USER_ID, { role: 'staff' });

    expect(captured.permissions).toEqual(ROLE_DEFAULT_PERMISSIONS.staff);
  });

  it('does not leave elevated permissions behind on a demotion', async () => {
    await service.update(USER_ID, { role: 'staff' });

    expect(captured.permissions).not.toContain('users:manage');
  });

  it('keeps an explicit permission list over the role defaults', async () => {
    await service.update(USER_ID, {
      role: 'staff',
      permissions: ['reports:view'],
    });

    expect(captured.permissions).toEqual(['reports:view']);
  });

  it('leaves permissions untouched when the role is not part of the update', async () => {
    await service.update(USER_ID, { fullName: 'Yeni Ad' });

    expect(captured.permissions).toBeUndefined();
    expect(captured.fullName).toBe('Yeni Ad');
  });

  it('passes deactivation through as a plain field update', async () => {
    await service.update(USER_ID, { isActive: false });

    expect(captured).toEqual({ isActive: false });
  });

  it('never lets an update carry an email or a password hash', async () => {
    await service.update(USER_ID, { fullName: 'Yeni Ad', role: 'manager' });

    expect(captured).not.toHaveProperty('email');
    expect(captured).not.toHaveProperty('passwordHash');
  });

  it('reports a missing user as 404 rather than inventing one', async () => {
    found = false;

    await expect(service.update(USER_ID, { fullName: 'X' })).rejects.toThrow(
      NotFoundException,
    );
  });
});

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ROLE_DEFAULT_PERMISSIONS } from '../auth/permissions';
import { toUserId } from './types/user.types';
import { PublicUser, UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { UserUpdateRecord } from './types/user.types';

const TARGET_ID = toUserId('11111111-1111-1111-1111-111111111111');
const ACTOR_ID = toUserId('22222222-2222-2222-2222-222222222222');

interface Harness {
  captured: UserUpdateRecord;
  target: PublicUser | null;
  activeAdmins: number;
}

describe('UsersService.update', () => {
  let h: Harness;
  let service: UsersService;

  const asUser = (over: Partial<PublicUser> = {}): PublicUser =>
    ({
      id: TARGET_ID,
      role: 'staff',
      isActive: true,
      permissions: [],
      ...over,
    }) as unknown as PublicUser;

  beforeEach(() => {
    h = {
      captured: undefined as unknown as UserUpdateRecord,
      target: asUser(),
      activeAdmins: 2,
    };
    const repository = {
      findById: jest.fn(() => Promise.resolve(h.target)),
      countActiveAdmins: jest.fn(() => Promise.resolve(h.activeAdmins)),
      update: jest.fn((_id: string, data: UserUpdateRecord) => {
        h.captured = data;
        return Promise.resolve(asUser());
      }),
    } as unknown as UsersRepository;
    service = new UsersService(repository);
  });

  describe('role and permissions', () => {
    it('re-seeds the role defaults when the role changes on its own', async () => {
      await service.update(TARGET_ID, { role: 'staff' }, ACTOR_ID);

      expect(h.captured.permissions).toEqual(ROLE_DEFAULT_PERMISSIONS.staff);
    });

    it('does not leave elevated permissions behind on a demotion', async () => {
      h.target = asUser({ role: 'manager' });

      await service.update(TARGET_ID, { role: 'staff' }, ACTOR_ID);

      expect(h.captured.permissions).not.toContain('users:manage');
    });

    it('keeps an explicit permission list over the role defaults', async () => {
      await service.update(
        TARGET_ID,
        { role: 'staff', permissions: ['reports:view'] },
        ACTOR_ID,
      );

      expect(h.captured.permissions).toEqual(['reports:view']);
    });

    it('leaves permissions untouched when the role is not part of the update', async () => {
      await service.update(TARGET_ID, { fullName: 'Yeni Ad' }, ACTOR_ID);

      expect(h.captured.permissions).toBeUndefined();
      expect(h.captured.fullName).toBe('Yeni Ad');
    });

    it('never lets an update carry an email or a password hash', async () => {
      await service.update(
        TARGET_ID,
        { fullName: 'Yeni Ad', role: 'manager' },
        ACTOR_ID,
      );

      expect(h.captured).not.toHaveProperty('email');
      expect(h.captured).not.toHaveProperty('passwordHash');
    });
  });

  describe('acting on your own account', () => {
    it('refuses to deactivate yourself', async () => {
      await expect(
        service.update(ACTOR_ID, { isActive: false }, ACTOR_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses to change your own role', async () => {
      h.target = asUser({ role: 'admin' });

      await expect(
        service.update(ACTOR_ID, { role: 'staff' }, ACTOR_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows editing your own profile fields', async () => {
      await expect(
        service.update(ACTOR_ID, { fullName: 'Kendi Adım' }, ACTOR_ID),
      ).resolves.toBeDefined();
    });

    it('allows a no-op role on yourself, since nothing actually changes', async () => {
      h.target = asUser({ role: 'admin' });

      await expect(
        service.update(ACTOR_ID, { role: 'admin' }, ACTOR_ID),
      ).resolves.toBeDefined();
    });

    it('still allows deactivating somebody else', async () => {
      await expect(
        service.update(TARGET_ID, { isActive: false }, ACTOR_ID),
      ).resolves.toBeDefined();
    });
  });

  describe('keeping at least one admin', () => {
    it('refuses to deactivate the last active admin', async () => {
      h.target = asUser({ role: 'admin' });
      h.activeAdmins = 1;

      await expect(
        service.update(TARGET_ID, { isActive: false }, ACTOR_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses to demote the last active admin', async () => {
      h.target = asUser({ role: 'admin' });
      h.activeAdmins = 1;

      await expect(
        service.update(TARGET_ID, { role: 'manager' }, ACTOR_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('allows demoting an admin while another one remains', async () => {
      h.target = asUser({ role: 'admin' });
      h.activeAdmins = 2;

      await expect(
        service.update(TARGET_ID, { role: 'manager' }, ACTOR_ID),
      ).resolves.toBeDefined();
    });

    it('does not count admins when the edit cannot remove one', async () => {
      h.target = asUser({ role: 'admin' });
      h.activeAdmins = 1;

      await expect(
        service.update(TARGET_ID, { fullName: 'Sadece Ad' }, ACTOR_ID),
      ).resolves.toBeDefined();
    });

    it('ignores an already-inactive admin, who is not holding the hotel up', async () => {
      h.target = asUser({ role: 'admin', isActive: false });
      h.activeAdmins = 1;

      await expect(
        service.update(TARGET_ID, { role: 'staff' }, ACTOR_ID),
      ).resolves.toBeDefined();
    });
  });

  it('reports a missing user as 404 rather than inventing one', async () => {
    h.target = null;

    await expect(
      service.update(TARGET_ID, { fullName: 'X' }, ACTOR_ID),
    ).rejects.toThrow(NotFoundException);
  });
});

import * as bcrypt from 'bcrypt';
import { BCRYPT_ROUNDS } from '../auth/password.constants';
import { PublicUser, UsersRepository } from './users.repository';
import { UsersService } from './users.service';

interface CapturedCreate {
  passwordHash: string;
  role: string;
  permissions: string[];
}

describe('UsersService password hashing', () => {
  let captured: CapturedCreate;
  let service: UsersService;

  beforeEach(() => {
    captured = undefined as unknown as CapturedCreate;
    const repository = {
      create: jest.fn((input: CapturedCreate) => {
        captured = input;
        return Promise.resolve({ id: 'u1' } as unknown as PublicUser);
      }),
    } as unknown as UsersRepository;
    service = new UsersService(repository);
  });

  it('hashes at the configured work factor (cost 12), never storing the plaintext', async () => {
    await service.create({
      email: 'new@alpha.test',
      password: 'secret1234',
      fullName: 'New User',
    });

    // bcrypt encodes the cost in the hash itself: $2b$12$...
    expect(captured.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(captured.passwordHash).not.toContain('secret1234');
    await expect(
      bcrypt.compare('secret1234', captured.passwordHash),
    ).resolves.toBe(true);
  });

  it('keeps the constant at the security baseline of 12', () => {
    expect(BCRYPT_ROUNDS).toBe(12);
  });
});

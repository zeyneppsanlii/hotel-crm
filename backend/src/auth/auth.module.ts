import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { SignOptions } from 'jsonwebtoken';
import { TenantModule } from '../common/tenant/tenant.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshTokenService } from './refresh-token.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        // jsonwebtoken accepts strings like '24h' at runtime; its types are narrower.
        signOptions: {
          expiresIn: config.get<string>(
            'JWT_EXPIRES_IN',
            '24h',
          ) as SignOptions['expiresIn'],
        },
      }),
    }),
    UsersModule,
    TenantModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RefreshTokenService,
    RefreshTokensRepository,
  ],
})
export class AuthModule {}

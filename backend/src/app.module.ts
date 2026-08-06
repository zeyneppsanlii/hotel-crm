import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { TenantModule } from './common/tenant/tenant.module';
import { TenantMiddleware } from './common/tenant/tenant.middleware';
import { RequestIdMiddleware } from './common/http/request-id.middleware';
import { ResponseEnvelopeInterceptor } from './common/http/response-envelope.interceptor';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';

@Module({
  imports: [
    // Loads .env and validates it (fail-fast). Global so ConfigService injects anywhere.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    TenantModule,
    UsersModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Standard response contract: wrap every success in the envelope, turn every
    // error into the error envelope.
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Global guards. Order matters: authenticate first (populates req.user),
    // then enforce permissions. Routes opt out of auth with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Request id first (so it's available to everything downstream), then resolve
    // tenant context from the x-tenant-id header.
    consumer.apply(RequestIdMiddleware, TenantMiddleware).forRoutes('*');
  }
}

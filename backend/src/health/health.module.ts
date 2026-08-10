import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

// PrismaService (global) and RedisService (global) are injected without imports.
@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}

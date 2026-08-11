import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  // Public + intentionally NOT wrapped in the standard response envelope: monitors
  // (Fly.io, UptimeRobot) expect a plain body and rely on the status code —
  // 200 when everything is up, 503 when any dependency is down.
  @Public()
  @Get()
  async check(@Res() res: Response): Promise<void> {
    const result = await this.healthService.check();
    const status =
      result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    res.status(status).json(result);
  }
}

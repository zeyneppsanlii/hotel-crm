import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  // bufferLogs so early startup logs are flushed through pino once it's ready.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties not in the DTO
      forbidNonWhitelisted: true, // 400 if unknown properties are sent
      transform: true, // coerce payloads to DTO instances
    }),
  );
  const config = app.get(ConfigService);
  await app.listen(config.get<number>('PORT', 3000));
}
void bootstrap();

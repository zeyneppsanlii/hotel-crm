import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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

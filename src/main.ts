import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

import {
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';

import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module.js';

import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';

async function bootstrap() {
  const app =
    await NestFactory.create(AppModule);

  const configService =
    app.get(ConfigService);

    app.use(
  helmet(),
);

  // ==================================================
  // CORS
  // ==================================================

  app.enableCors({
    origin: configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    ),

    credentials: true,

    methods: [
      'GET',
      'POST',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization',
    ],
  });

  // ==================================================
  // GLOBAL ERROR HANDLER
  // ==================================================

  app.useGlobalFilters(
    new HttpExceptionFilter(),
  );

  // ==================================================
  // GLOBAL REQUEST VALIDATION
  // ==================================================

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ==================================================
  // GLOBAL API PREFIX
  // ==================================================

  app.setGlobalPrefix('api');

  // ==================================================
  // SWAGGER
  // ==================================================

  const config =
    new DocumentBuilder()
      .setTitle('Hotel Booking API')
      .setDescription(
        'API for the Hotel Booking System',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();

  const document =
    SwaggerModule.createDocument(
      app,
      config,
    );

  SwaggerModule.setup(
    'api/docs',
    app,
    document,
  );

  // ==================================================
  // START SERVER
  // ==================================================

  const port =
    configService.get<number>(
      'PORT',
      4000,
    );

  await app.listen(port);
}

bootstrap();
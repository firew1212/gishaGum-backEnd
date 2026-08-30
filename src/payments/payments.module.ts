import { Module } from '@nestjs/common';

import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '../prisma/prisma.module.js';

import { ChapaService } from './chapa/chapa.service.js';

import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
  ],

  controllers: [
    PaymentsController,
  ],

  providers: [
    PaymentsService,
    ChapaService,
  ],

  exports: [
    PaymentsService,
  ],
})
export class PaymentsModule {}
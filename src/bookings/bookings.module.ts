import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

@Module({
  controllers: [BookingsController],
  providers: [
    BookingsService,
    PrismaService,
  ],
})
export class BookingsModule {}
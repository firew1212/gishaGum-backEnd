import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
  ],

  controllers: [
    BookingsController,
  ],

  providers: [
    BookingsService,
  ],

  exports: [
    BookingsService,
  ],
})
export class BookingsModule {}
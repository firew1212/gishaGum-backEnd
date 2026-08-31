import { Module } from '@nestjs/common';
import {ThrottlerModule} from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ConfigModule } from '@nestjs/config';
import { RoomsModule } from './rooms/rooms.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { GuestsModule } from './guests/guests.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { validateEnvironment } from './config/env.validation.js';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';


@Module({
  imports: [

       ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),

    ThrottlerModule.forRoot([
  {
    ttl: 60000,
    limit: 100,
  },
]),

   PrismaModule,
   AuthModule,
   RoomsModule,
   BookingsModule,
   PaymentsModule,
   GuestsModule,
   NotificationsModule,
   ReportsModule,

  ],
  controllers: [AppController],
  providers: [
  AppService,

  {
    provide: APP_GUARD,
    useClass: ThrottlerGuard,
  },
],
})
export class AppModule {}

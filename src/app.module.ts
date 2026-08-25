import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ConfigModule } from '@nestjs/config';
import { RoomsModule } from './rooms/rooms.module.js';
import { BookingsModule } from './bookings/bookings.module.js';

@Module({
  imports: [
   PrismaModule,
   AuthModule,
   RoomsModule,
   BookingsModule,
   ConfigModule.forRoot({
      isGlobal: true,
    }),
  

  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

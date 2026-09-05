import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

import { RoomTypesController } from './room-types.controller.js';
import { RoomsController } from './rooms.controller.js';
import { RoomAvailabilityController } from './room-availability.controller.js';
import { RoomsService } from './rooms.service.js';

@Module({
  controllers: [
    RoomTypesController,
    RoomsController,
    RoomAvailabilityController,
  ],
  providers: [RoomsService, PrismaService],
})
export class RoomsModule {}

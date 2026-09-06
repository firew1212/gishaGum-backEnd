import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';

import { GuestsController } from './guests.controller.js';
import { GuestsService } from './guests.service.js';

@Module({
  imports: [PrismaModule],

  controllers: [GuestsController],

  providers: [GuestsService],

  exports: [GuestsService],
})
export class GuestsModule {}

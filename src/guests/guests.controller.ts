import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import { CreateGuestDto } from './dto/create-guest.dto.js';
import { UpdateGuestDto } from './dto/update-guest.dto.js';
import { GuestsService } from './guests.service.js';

@Controller('guests')
@UseGuards(JwtAuthGuard)
export class GuestsController {
  constructor(private readonly guestsService: GuestsService) {}

  // ==================================================
  // CREATE GUEST
  // ==================================================

  @Post('booking/:bookingId')
  createGuest(
    @Req() request: Request,
    @Param('bookingId') bookingId: string,
    @Body() dto: CreateGuestDto,
  ) {
    const user = request.user as {
      id: string;
    };

    return this.guestsService.createGuest(user.id, bookingId, dto);
  }

  // ==================================================
  // GET BOOKING GUESTS
  // ==================================================

  @Get('booking/:bookingId')
  findMyBookingGuests(
    @Req() request: Request,
    @Param('bookingId') bookingId: string,
  ) {
    const user = request.user as {
      id: string;
    };

    return this.guestsService.findMyBookingGuests(user.id, bookingId);
  }

  // ==================================================
  // GET SINGLE GUEST
  // ==================================================

  @Get(':id')
  findMyGuest(@Req() request: Request, @Param('id') guestId: string) {
    const user = request.user as {
      id: string;
    };

    return this.guestsService.findMyGuest(user.id, guestId);
  }

  // ==================================================
  // UPDATE GUEST
  // ==================================================

  @Patch(':id')
  updateGuest(
    @Req() request: Request,
    @Param('id') guestId: string,
    @Body() dto: UpdateGuestDto,
  ) {
    const user = request.user as {
      id: string;
    };

    return this.guestsService.updateGuest(user.id, guestId, dto);
  }

  // ==================================================
  // DELETE GUEST
  // ==================================================

  @Delete(':id')
  deleteGuest(@Req() request: Request, @Param('id') guestId: string) {
    const user = request.user as {
      id: string;
    };

    return this.guestsService.deleteGuest(user.id, guestId);
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { UserRole } from '../../generated/prisma/client.js';

import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';

import { UpdateBookingStatusDto } from './dto/update-booking-status.dto.js';

import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import { CreateBookingDto } from './dto/create-booking.dto.js';
import { BookingsService } from './bookings.service.js';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
  ) {}

  @Post()
  create(
    @Req() request: Request,
    @Body() dto: CreateBookingDto,
  ) {
    const user = request.user as {
      id: string;
      role: string;
    };

    return this.bookingsService.createBooking(
      user.id,
      dto,
    );
  }

  @Get('my')
  findMyBookings(@Req() request: Request) {
    const user = request.user as {
      id: string;
    };

    return this.bookingsService.findMyBookings(
      user.id,
    );
  }

  @Get('my/:id')
  findMyBooking(
    @Req() request: Request,
    @Param('id') bookingId: string,
  ) {
    const user = request.user as {
      id: string;
    };

    return this.bookingsService.findMyBooking(
      user.id,
      bookingId,
    );
  }

  @Patch(':id/cancel')
  cancel(
    @Req() request: Request,
    @Param('id') bookingId: string,
  ) {
    const user = request.user as {
      id: string;
    };

    return this.bookingsService.cancelBooking(
      user.id,
      bookingId,
    );
  }

  @Get()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CASHIER)
findAllBookings() {
  return this.bookingsService.findAllBookings();
}

@Get(':id')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CASHIER)
findBookingById(
  @Param('id') bookingId: string,
) {
  return this.bookingsService.findBookingById(
    bookingId,
  );
}

@Patch(':id/status')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CASHIER)
updateStatus(
  @Param('id') bookingId: string,
  @Body() dto: UpdateBookingStatusDto,
) {
  return this.bookingsService.updateBookingStatus(
    bookingId,
    dto.status,
  );
}
}
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

import type { Request } from 'express';

import { UserRole } from '../../generated/prisma/client.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';

import { CreateBookingDto } from './dto/create-booking.dto.js';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto.js';
import { BookingsService } from './bookings.service.js';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
  ) {}

  // ==================================================
  // CUSTOMER — CREATE BOOKING
  // ==================================================

  @Post()
  create(
    @Req() request: Request,
    @Body() dto: CreateBookingDto,
  ) {
    const user = request.user as {
      id: string;
    };

    return this.bookingsService.createBooking(
      user.id,
      dto,
    );
  }

  // ==================================================
  // CUSTOMER — MY BOOKINGS
  // ==================================================

  @Get('my')
  findMyBookings(@Req() request: Request) {
    const user = request.user as {
      id: string;
    };

    return this.bookingsService.findMyBookings(
      user.id,
    );
  }

  // ==================================================
  // CUSTOMER — SINGLE BOOKING
  // ==================================================

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

  // ==================================================
  // CUSTOMER — CANCEL BOOKING
  // ==================================================

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

  // ==================================================
  // ADMIN / CASHIER — ALL BOOKINGS
  // ==================================================

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  findAllBookings() {
    return this.bookingsService.findAllBookings();
  }

  // ==================================================
  // ADMIN / CASHIER — SINGLE BOOKING
  // ==================================================

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  findBookingById(
    @Param('id') bookingId: string,
  ) {
    return this.bookingsService.findBookingById(
      bookingId,
    );
  }

  // ==================================================
  // ADMIN / CASHIER — UPDATE STATUS
  // ==================================================

  @Patch(':id/status')
  @UseGuards(RolesGuard)
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

  // ==================================================
  // ADMIN / CASHIER — CHECK IN
  // ==================================================

  @Patch(':id/check-in')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  checkInBooking(
    @Param('id') bookingId: string,
  ) {
    return this.bookingsService.checkInBooking(
      bookingId,
    );
  }

  // ==================================================
  // ADMIN / CASHIER — CHECK OUT
  // ==================================================

  @Patch(':id/check-out')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  checkOutBooking(
    @Param('id') bookingId: string,
  ) {
    return this.bookingsService.checkOutBooking(
      bookingId,
    );
  }
}
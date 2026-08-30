import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

import { CreateGuestDto } from './dto/create-guest.dto.js';
import { UpdateGuestDto } from './dto/update-guest.dto.js';

@Injectable()
export class GuestsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // ==================================================
  // CREATE GUEST
  // ==================================================

  async createGuest(
    customerId: string,
    bookingId: string,
    dto: CreateGuestDto,
  ) {
    const booking =
      await this.prisma.booking.findFirst({
        where: {
          id: bookingId,
          customerId,
        },
      });

    if (!booking) {
      throw new NotFoundException(
        'Booking not found',
      );
    }

    if (dto.isPrimary) {
      const existingPrimary =
        await this.prisma.guest.findFirst({
          where: {
            bookingId,
            isPrimary: true,
          },
        });

      if (existingPrimary) {
        throw new ConflictException(
          'This booking already has a primary guest',
        );
      }
    }

    return this.prisma.guest.create({
      data: {
        bookingId,
        fullName: dto.fullName,
        phone: dto.phone,
        nationalId: dto.nationalId,
        nationality: dto.nationality,
        email: dto.email,
        isPrimary: dto.isPrimary ?? false,
      },
    });
  }

  // ==================================================
  // GET MY BOOKING GUESTS
  // ==================================================

  async findMyBookingGuests(
    customerId: string,
    bookingId: string,
  ) {
    const booking =
      await this.prisma.booking.findFirst({
        where: {
          id: bookingId,
          customerId,
        },
      });

    if (!booking) {
      throw new NotFoundException(
        'Booking not found',
      );
    }

    return this.prisma.guest.findMany({
      where: {
        bookingId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  // ==================================================
  // GET SINGLE GUEST
  // ==================================================

  async findMyGuest(
    customerId: string,
    guestId: string,
  ) {
    const guest =
      await this.prisma.guest.findFirst({
        where: {
          id: guestId,
          booking: {
            customerId,
          },
        },
      });

    if (!guest) {
      throw new NotFoundException(
        'Guest not found',
      );
    }

    return guest;
  }

  // ==================================================
  // UPDATE GUEST
  // ==================================================

  async updateGuest(
    customerId: string,
    guestId: string,
    dto: UpdateGuestDto,
  ) {
    const guest =
      await this.prisma.guest.findFirst({
        where: {
          id: guestId,
          booking: {
            customerId,
          },
        },
      });

    if (!guest) {
      throw new NotFoundException(
        'Guest not found',
      );
    }

    if (dto.isPrimary === true) {
      const existingPrimary =
        await this.prisma.guest.findFirst({
          where: {
            bookingId: guest.bookingId,
            isPrimary: true,
            id: {
              not: guestId,
            },
          },
        });

      if (existingPrimary) {
        throw new ConflictException(
          'This booking already has a primary guest',
        );
      }
    }

    return this.prisma.guest.update({
      where: {
        id: guestId,
      },
      data: dto,
    });
  }

  // ==================================================
  // DELETE GUEST
  // ==================================================

  async deleteGuest(
    customerId: string,
    guestId: string,
  ) {
    const guest =
      await this.prisma.guest.findFirst({
        where: {
          id: guestId,
          booking: {
            customerId,
          },
        },
      });

    if (!guest) {
      throw new NotFoundException(
        'Guest not found',
      );
    }

    if (guest.isPrimary) {
      throw new ConflictException(
        'Primary guest cannot be deleted',
      );
    }

    await this.prisma.guest.delete({
      where: {
        id: guestId,
      },
    });

    return {
      success: true,
      message: 'Guest deleted successfully',
    };
  }
}
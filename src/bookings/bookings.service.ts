import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  BookingStatus,
  Prisma,
  RoomStatus,
} from '../../generated/prisma/client.js';

import { PrismaService } from '../prisma/prisma.service.js';

import { CreateBookingDto } from './dto/create-booking.dto.js';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // ============================================================
  // CUSTOMER: CREATE BOOKING
  // ============================================================

  async createBooking(
    customerId: string,
    dto: CreateBookingDto,
  ) {
    const checkIn = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);

    this.validateBookingDates(
      checkIn,
      checkOut,
    );

    const roomIds = dto.rooms.map(
      (room) => room.roomId,
    );

    this.validateRoomIds(roomIds);

    return this.prisma.$transaction(
      async (tx) => {
        /*
         * Lock requested rooms.
         *
         * This is the important concurrency protection.
         *
         * Two simultaneous requests for the same room
         * cannot both pass this section at the same time.
         */
        await tx.$queryRaw`
          SELECT id
          FROM "Room"
          WHERE id IN (${Prisma.join(roomIds)})
          ORDER BY id
          FOR UPDATE
        `;

        // --------------------------------------------------------
        // Verify rooms exist and get their prices
        // --------------------------------------------------------

        const rooms = await tx.room.findMany({
          where: {
            id: {
              in: roomIds,
            },
          },
          include: {
            roomType: true,
          },
        });

        if (rooms.length !== roomIds.length) {
          throw new NotFoundException(
            'One or more rooms were not found',
          );
        }

        // --------------------------------------------------------
        // Check room status
        // --------------------------------------------------------

        const unavailableRoom = rooms.find(
          (room) =>
            room.status === RoomStatus.MAINTENANCE ||
            room.status === RoomStatus.OUT_OF_SERVICE,
        );

        if (unavailableRoom) {
          throw new ConflictException(
            `Room ${unavailableRoom.roomNumber} is not available`,
          );
        }

        // --------------------------------------------------------
        // Check overlapping bookings
        // --------------------------------------------------------

        const conflictingRooms =
          await tx.bookingRoom.findMany({
            where: {
              roomId: {
                in: roomIds,
              },

              isActive: true,

              checkIn: {
                lt: checkOut,
              },

              checkOut: {
                gt: checkIn,
              },

              booking: {
                status: {
                  not: BookingStatus.CANCELLED,
                },
              },
            },

            select: {
              roomId: true,
            },
          });

        if (conflictingRooms.length > 0) {
          throw new ConflictException(
            'One or more rooms are already booked for these dates',
          );
        }

        // --------------------------------------------------------
        // Calculate number of nights
        // --------------------------------------------------------

        const nights =
          this.calculateNights(
            checkIn,
            checkOut,
          );

        // --------------------------------------------------------
        // Calculate total amount using Decimal
        // --------------------------------------------------------

        let totalAmount = new Prisma.Decimal(0);

        for (const room of rooms) {
          totalAmount = totalAmount.plus(
            new Prisma.Decimal(room.roomType.price).mul(
              nights,
            ),
          );
        }

        // --------------------------------------------------------
        // Generate booking reference
        // --------------------------------------------------------

        const bookingReference =
          await this.generateBookingReference(tx);

        // --------------------------------------------------------
        // Create booking
        // --------------------------------------------------------

        const booking = await tx.booking.create({
          data: {
            bookingReference,

            customerId,

            checkIn,

            checkOut,

            status: BookingStatus.PENDING,

            totalAmount,

            rooms: {
              create: roomIds.map(
                (roomId) => ({
                  roomId,
                  checkIn,
                  checkOut,
                  isActive: true,
                }),
              ),
            },

            guests: {
              create: dto.guests.map(
                (guest) => ({
                  fullName: guest.fullName,
                  phone: guest.phone,
                  nationalId: guest.nationalId,
                  nationality:
                    guest.nationality,
                  email: guest.email,
                  isPrimary:
                    guest.isPrimary ?? false,
                }),
              ),
            },
          },

          include: {
            rooms: {
              include: {
                room: {
                  include: {
                    roomType: true,
                  },
                },
              },
            },

            guests: true,
          },
        });

        return booking;
      },

      {
        maxWait: 10000,
        timeout: 20000,
      },
    );
  }

  // ============================================================
  // CUSTOMER: GET MY BOOKINGS
  // ============================================================

  async findMyBookings(
    customerId: string,
  ) {
    return this.prisma.booking.findMany({
      where: {
        customerId,
      },

      include: {
        rooms: {
          include: {
            room: {
              include: {
                roomType: true,
              },
            },
          },
        },

        guests: true,

        payments: true,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // ============================================================
  // CUSTOMER: GET ONE OF MY BOOKINGS
  // ============================================================

  async findMyBooking(
    customerId: string,
    bookingId: string,
  ) {
    const booking =
      await this.prisma.booking.findFirst({
        where: {
          id: bookingId,
          customerId,
        },

        include: {
          rooms: {
            include: {
              room: {
                include: {
                  roomType: true,
                },
              },
            },
          },

          guests: true,

          payments: true,
        },
      });

    if (!booking) {
      throw new NotFoundException(
        'Booking not found',
      );
    }

    return booking;
  }

  // ============================================================
  // CUSTOMER: CANCEL BOOKING
  // ============================================================

  async cancelBooking(
    customerId: string,
    bookingId: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const booking =
          await tx.booking.findFirst({
            where: {
              id: bookingId,
              customerId,
            },

            include: {
              rooms: true,
            },
          });

        if (!booking) {
          throw new NotFoundException(
            'Booking not found',
          );
        }

        if (
          booking.status ===
          BookingStatus.CANCELLED
        ) {
          throw new ConflictException(
            'Booking is already cancelled',
          );
        }

        if (
          booking.status ===
            BookingStatus.CHECKED_IN ||
          booking.status ===
            BookingStatus.CHECKED_OUT
        ) {
          throw new ConflictException(
            'This booking cannot be cancelled',
          );
        }

        /*
         * Deactivate room assignments.
         */
        await tx.bookingRoom.updateMany({
          where: {
            bookingId: booking.id,
          },

          data: {
            isActive: false,
          },
        });

        /*
         * Change booking status.
         */
        return tx.booking.update({
          where: {
            id: booking.id,
          },

          data: {
            status:
              BookingStatus.CANCELLED,
          },

          include: {
            rooms: {
              include: {
                room: true,
              },
            },

            guests: true,
          },
        });
      },

      {
        maxWait: 10000,
        timeout: 20000,
      },
    );
  }

  // ============================================================
  // ADMIN / CASHIER: GET ALL BOOKINGS
  // ============================================================

  async findAllBookings() {
    return this.prisma.booking.findMany({
      include: {
        customer: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
          },
        },

        rooms: {
          include: {
            room: {
              include: {
                roomType: true,
              },
            },
          },
        },

        guests: true,

        payments: true,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // ============================================================
  // ADMIN / CASHIER: GET ONE BOOKING
  // ============================================================

  async findBookingById(
    bookingId: string,
  ) {
    const booking =
      await this.prisma.booking.findUnique({
        where: {
          id: bookingId,
        },

        include: {
          customer: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              email: true,
            },
          },

          rooms: {
            include: {
              room: {
                include: {
                  roomType: true,
                },
              },
            },
          },

          guests: true,

          payments: true,
        },
      });

    if (!booking) {
      throw new NotFoundException(
        'Booking not found',
      );
    }

    return booking;
  }

  // ============================================================
  // ADMIN / CASHIER: UPDATE BOOKING STATUS
  // ============================================================

  async updateBookingStatus(
    bookingId: string,
    newStatus: BookingStatus,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const booking =
          await tx.booking.findUnique({
            where: {
              id: bookingId,
            },

            include: {
              rooms: true,
            },
          });

        if (!booking) {
          throw new NotFoundException(
            'Booking not found',
          );
        }

        this.validateStatusTransition(
          booking.status,
          newStatus,
        );

        const roomIds =
          booking.rooms.map(
            (bookingRoom) =>
              bookingRoom.roomId,
          );

        /*
         * Lock the rooms before changing
         * their physical status.
         */
        if (roomIds.length > 0) {
          await tx.$queryRaw`
            SELECT id
            FROM "Room"
            WHERE id IN (${Prisma.join(roomIds)})
            ORDER BY id
            FOR UPDATE
          `;
        }

        // --------------------------------------------------------
        // CHECK-IN
        // --------------------------------------------------------

        if (
          newStatus ===
          BookingStatus.CHECKED_IN
        ) {
          await tx.room.updateMany({
            where: {
              id: {
                in: roomIds,
              },
            },

            data: {
              status:
                RoomStatus.OCCUPIED,
            },
          });
        }

        // --------------------------------------------------------
        // CHECK-OUT
        // --------------------------------------------------------

        if (
          newStatus ===
          BookingStatus.CHECKED_OUT
        ) {
          await tx.room.updateMany({
            where: {
              id: {
                in: roomIds,
              },
            },

            data: {
              status:
                RoomStatus.AVAILABLE,
            },
          });

          await tx.bookingRoom.updateMany({
            where: {
              bookingId: booking.id,
            },

            data: {
              isActive: false,
            },
          });
        }

        // --------------------------------------------------------
        // CANCEL
        // --------------------------------------------------------

        if (
          newStatus ===
          BookingStatus.CANCELLED
        ) {
          await tx.bookingRoom.updateMany({
            where: {
              bookingId: booking.id,
            },

            data: {
              isActive: false,
            },
          });
        }

        // --------------------------------------------------------
        // Update booking status
        // --------------------------------------------------------

        return tx.booking.update({
          where: {
            id: booking.id,
          },

          data: {
            status: newStatus,
          },

          include: {
            rooms: {
              include: {
                room: true,
              },
            },

            guests: true,
          },
        });
      },

      {
        maxWait: 10000,
        timeout: 20000,
      },
    );
  }

  // ============================================================
  // PRIVATE: STATUS TRANSITION VALIDATION
  // ============================================================

  private validateStatusTransition(
    currentStatus: BookingStatus,
    newStatus: BookingStatus,
  ) {
    const allowedTransitions: Record<
      BookingStatus,
      BookingStatus[]
    > = {
      [BookingStatus.PENDING]: [
        BookingStatus.CONFIRMED,
        BookingStatus.CANCELLED,
      ],

      [BookingStatus.CONFIRMED]: [
        BookingStatus.CHECKED_IN,
        BookingStatus.CANCELLED,
      ],

      [BookingStatus.CHECKED_IN]: [
        BookingStatus.CHECKED_OUT,
      ],

      [BookingStatus.CHECKED_OUT]: [],

      [BookingStatus.CANCELLED]: [],
    };

    if (
      currentStatus === newStatus
    ) {
      throw new BadRequestException(
        `Booking is already ${currentStatus}`,
      );
    }

    if (
      !allowedTransitions[
        currentStatus
      ].includes(newStatus)
    ) {
      throw new ConflictException(
        `Cannot change booking status from ${currentStatus} to ${newStatus}`,
      );
    }
  }

  // ============================================================
  // PRIVATE: DATE VALIDATION
  // ============================================================

  private validateBookingDates(
    checkIn: Date,
    checkOut: Date,
  ) {
    if (
      Number.isNaN(checkIn.getTime()) ||
      Number.isNaN(checkOut.getTime())
    ) {
      throw new BadRequestException(
        'Invalid check-in or check-out date',
      );
    }

    if (checkIn >= checkOut) {
      throw new BadRequestException(
        'Check-out must be after check-in',
      );
    }
  }

  // ============================================================
  // PRIVATE: ROOM ID VALIDATION
  // ============================================================

  private validateRoomIds(
    roomIds: string[],
  ) {
    if (roomIds.length === 0) {
      throw new BadRequestException(
        'At least one room is required',
      );
    }

    const uniqueRoomIds =
      new Set(roomIds);

    if (
      uniqueRoomIds.size !== roomIds.length
    ) {
      throw new BadRequestException(
        'Duplicate rooms are not allowed',
      );
    }
  }

  // ============================================================
  // PRIVATE: CALCULATE NIGHTS
  // ============================================================

  private calculateNights(
    checkIn: Date,
    checkOut: Date,
  ): number {
    const millisecondsPerDay =
      1000 * 60 * 60 * 24;

    const difference =
      checkOut.getTime() -
      checkIn.getTime();

    return Math.ceil(
      difference / millisecondsPerDay,
    );
  }

  // ============================================================
  // PRIVATE: BOOKING REFERENCE
  // ============================================================

  private async generateBookingReference(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    let reference: string;

    while (true) {
      reference =
        `HTL-${Date.now()}-${Math.floor(
          Math.random() * 10000,
        )
          .toString()
          .padStart(4, '0')}`;

      const existing =
        await tx.booking.findUnique({
          where: {
            bookingReference: reference,
          },
        });

      if (!existing) {
        return reference;
      }
    }
  }
}
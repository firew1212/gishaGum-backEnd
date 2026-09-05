import { Injectable } from '@nestjs/common';

import {
  BookingStatus,
  PaymentStatus,
  RoomStatus,
} from '../../generated/prisma/client.js';

import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================================================
  // ADMIN / CASHIER — HOTEL DASHBOARD
  // ==================================================

  async getDashboard() {
    const [
      totalBookings,
      pendingBookings,
      confirmedBookings,
      checkedInBookings,
      checkedOutBookings,
      cancelledBookings,

      totalRooms,
      availableRooms,
      occupiedRooms,
      maintenanceRooms,
      outOfServiceRooms,

      paidPayments,
      pendingPayments,
    ] = await Promise.all([
      // ----------------------------------------------
      // BOOKINGS
      // ----------------------------------------------

      this.prisma.booking.count(),

      this.prisma.booking.count({
        where: {
          status: BookingStatus.PENDING,
        },
      }),

      this.prisma.booking.count({
        where: {
          status: BookingStatus.CONFIRMED,
        },
      }),

      this.prisma.booking.count({
        where: {
          status: BookingStatus.CHECKED_IN,
        },
      }),

      this.prisma.booking.count({
        where: {
          status: BookingStatus.CHECKED_OUT,
        },
      }),

      this.prisma.booking.count({
        where: {
          status: BookingStatus.CANCELLED,
        },
      }),

      // ----------------------------------------------
      // ROOMS
      // ----------------------------------------------

      this.prisma.room.count(),

      this.prisma.room.count({
        where: {
          status: RoomStatus.AVAILABLE,
        },
      }),

      this.prisma.room.count({
        where: {
          status: RoomStatus.OCCUPIED,
        },
      }),

      this.prisma.room.count({
        where: {
          status: RoomStatus.MAINTENANCE,
        },
      }),

      this.prisma.room.count({
        where: {
          status: RoomStatus.OUT_OF_SERVICE,
        },
      }),

      // ----------------------------------------------
      // PAYMENTS
      // ----------------------------------------------

      this.prisma.payment.aggregate({
        where: {
          status: PaymentStatus.PAID,
        },

        _sum: {
          amount: true,
        },
      }),

      this.prisma.payment.aggregate({
        where: {
          status: PaymentStatus.PENDING,
        },

        _sum: {
          amount: true,
        },
      }),
    ]);

    const totalRevenue = Number(paidPayments._sum.amount ?? 0);

    const pendingAmount = Number(pendingPayments._sum.amount ?? 0);

    return {
      bookings: {
        total: totalBookings,
        pending: pendingBookings,
        confirmed: confirmedBookings,
        checkedIn: checkedInBookings,
        checkedOut: checkedOutBookings,
        cancelled: cancelledBookings,
      },

      rooms: {
        total: totalRooms,
        available: availableRooms,
        occupied: occupiedRooms,
        maintenance: maintenanceRooms,
        outOfService: outOfServiceRooms,
      },

      payments: {
        totalRevenue: Number(totalRevenue.toFixed(2)),

        pendingAmount: Number(pendingAmount.toFixed(2)),
      },
    };
  }
}

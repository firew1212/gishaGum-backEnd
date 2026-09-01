import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { randomUUID } from 'node:crypto';

import {
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  NotificationType,
} from '../../generated/prisma/client.js';

import { PrismaService } from '../prisma/prisma.service.js';

import { ChapaService } from './chapa/chapa.service.js';

import { InitializePaymentDto } from './dto/initialize-payment.dto.js';
import { ManualPaymentDto } from './dto/manual-payment.dto.js';
import { PaymentFilterDto } from './dto/payment-filter.dto.js';

import { NotificationsService } from '../notifications/notifications.service.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chapaService: ChapaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ==================================================
  // CUSTOMER — INITIALIZE CHAPA PAYMENT
  // ==================================================

  async initializePayment(
    customerId: string,
    dto: InitializePaymentDto,
  ) {
    if (
      dto.paymentMethod === PaymentMethod.CASH ||
      dto.paymentMethod === PaymentMethod.BANK_TRANSFER
    ) {
      throw new BadRequestException(
        'Cash and bank transfer payments must be recorded manually',
      );
    }

    const booking =
      await this.prisma.booking.findFirst({
        where: {
          id: dto.bookingId,
          customerId,
        },

        include: {
          customer: {
            select: {
              fullName: true,
              phone: true,
              email: true,
            },
          },

          payments: {
            select: {
              amount: true,
              status: true,
            },
          },
        },
      });

    if (!booking) {
      throw new NotFoundException(
        'Booking not found',
      );
    }

    if (
      booking.status === BookingStatus.CANCELLED
    ) {
      throw new ConflictException(
        'Cancelled booking cannot receive payment',
      );
    }

    if (
      booking.status === BookingStatus.CHECKED_OUT
    ) {
      throw new ConflictException(
        'Checked-out booking cannot receive payment',
      );
    }

    const amount =
      this.calculatePaymentAmount(
        booking.totalAmount,
        booking.payments,
        dto.paymentType,
      );

    if (amount <= 0) {
      throw new BadRequestException(
        'No payment is required for this booking',
      );
    }

    const txRef =
      this.generateTransactionReference();

    const payment =
      await this.prisma.payment.create({
        data: {
          bookingId: booking.id,
          amount,
          paymentType: dto.paymentType,
          paymentMethod: dto.paymentMethod,
          status: PaymentStatus.PENDING,
          txRef,
        },
      });

    try {
      const chapaResponse =
        await this.chapaService.initializeTransaction({
          amount: amount.toFixed(2),

          currency: 'ETB',

          email:
            booking.customer.email ??
            undefined,

          first_name:
            this.getFirstName(
              booking.customer.fullName,
            ),

          last_name:
            this.getLastName(
              booking.customer.fullName,
            ),

          phone_number:
            booking.customer.phone,

          tx_ref: txRef,

          callback_url:
            this.getRequiredConfig(
              'CHAPA_CALLBACK_URL',
            ),

          return_url:
            this.getRequiredConfig(
              'CHAPA_RETURN_URL',
            ),
        });

      const checkoutUrl =
        chapaResponse.data?.checkout_url;

      if (!checkoutUrl) {
        await this.prisma.payment.update({
          where: {
            id: payment.id,
          },

          data: {
            status: PaymentStatus.FAILED,
          },
        });

        throw new BadRequestException(
          'Chapa did not return a checkout URL',
        );
      }

      const gatewayReference =
        chapaResponse.data?.reference;

      if (gatewayReference) {
        await this.prisma.payment.update({
          where: {
            id: payment.id,
          },

          data: {
            gatewayReference,
          },
        });
      }

      return {
        success: true,

        message:
          'Payment initialized successfully',

        paymentId:
          payment.id,

        txRef,

        amount,

        checkoutUrl,
      };
    } catch (error) {
      await this.prisma.payment.update({
        where: {
          id: payment.id,
        },

        data: {
          status: PaymentStatus.FAILED,
        },
      });

      throw error;
    }
  }

  // ==================================================
  // CUSTOMER — VERIFY CHAPA PAYMENT
  // ==================================================

  async verifyPayment(
    customerId: string,
    txRef: string,
  ) {
    const payment =
      await this.prisma.payment.findUnique({
        where: {
          txRef,
        },

        include: {
          booking: {
            select: {
              id: true,
              customerId: true,
              totalAmount: true,
            },
          },
        },
      });

    if (!payment) {
      throw new NotFoundException(
        'Payment not found',
      );
    }

    if (
      payment.booking.customerId !==
      customerId
    ) {
      throw new NotFoundException(
        'Payment not found',
      );
    }

    // ------------------------------------------------
    // Already paid — idempotency
    // ------------------------------------------------

    if (
      payment.status ===
      PaymentStatus.PAID
    ) {
      return {
        success: true,

        message:
          'Payment already processed',

        paymentId:
          payment.id,

        txRef:
          payment.txRef,

        status:
          payment.status,
      };
    }

    const chapaResponse =
      await this.chapaService.verifyTransaction(
        txRef,
      );

    const chapaStatus =
      String(
        chapaResponse.data?.status ??
          chapaResponse.status ??
          '',
      ).toLowerCase();

    const gatewayReference =
      chapaResponse.data?.reference;

    // ------------------------------------------------
    // Successful payment
    // ------------------------------------------------

    if (
      chapaStatus === 'success' ||
      chapaStatus === 'successful' ||
      chapaStatus === 'paid' ||
      chapaStatus === 'completed'
    ) {
      const updatedPayment =
        await this.prisma.payment.update({
          where: {
            id: payment.id,
          },

          data: {
            status: PaymentStatus.PAID,

            paidAt:
              payment.paidAt ??
              new Date(),

            gatewayReference:
              gatewayReference ??
              payment.gatewayReference,
          },
        });

      // ------------------------------------------------
      // AUTOMATIC PAYMENT NOTIFICATION
      // ------------------------------------------------

      await this.notificationsService.createNotification({
        userId:
          payment.booking.customerId,

        type:
          NotificationType.PAYMENT_RECEIVED,

        message:
          `Payment of ${Number(payment.amount).toFixed(2)} ETB has been received successfully.`,
      });

      return {
        success: true,

        message:
          'Payment verified successfully',

        paymentId:
          updatedPayment.id,

        txRef:
          updatedPayment.txRef,

        status:
          updatedPayment.status,

        chapaStatus,

        paidAt:
          updatedPayment.paidAt,
      };
    }

    // ------------------------------------------------
    // Failed / cancelled payment
    // ------------------------------------------------

    if (
      chapaStatus === 'failed' ||
      chapaStatus === 'cancelled' ||
      chapaStatus === 'canceled'
    ) {
      const updatedPayment =
        await this.prisma.payment.update({
          where: {
            id: payment.id,
          },

          data: {
            status:
              PaymentStatus.FAILED,

            gatewayReference:
              gatewayReference ??
              payment.gatewayReference,
          },
        });

      return {
        success: false,

        message:
          'Payment failed or was cancelled',

        paymentId:
          updatedPayment.id,

        txRef:
          updatedPayment.txRef,

        status:
          updatedPayment.status,

        chapaStatus,
      };
    }

    // ------------------------------------------------
    // Still pending
    // ------------------------------------------------

    return {
      success: true,

      message:
        'Payment is still pending',

      paymentId:
        payment.id,

      txRef:
        payment.txRef,

      status:
        payment.status,

      chapaStatus,
    };
  }

  // ==================================================
  // CHAPA — CALLBACK / WEBHOOK
  // ==================================================

  async handleChapaCallback(
    body: unknown,
  ) {
    if (
      !body ||
      typeof body !== 'object'
    ) {
      throw new BadRequestException(
        'Invalid Chapa callback payload',
      );
    }

    const payload =
      body as Record<string, unknown>;

    const txRef =
      typeof payload.tx_ref === 'string'
        ? payload.tx_ref
        : undefined;

    const status =
      typeof payload.status === 'string'
        ? payload.status.toLowerCase()
        : undefined;

    const reference =
      typeof payload.reference === 'string'
        ? payload.reference
        : undefined;

    if (!txRef) {
      throw new BadRequestException(
        'Chapa callback does not contain tx_ref',
      );
    }

    const payment =
      await this.prisma.payment.findUnique({
        where: {
          txRef,
        },

        include: {
          booking: {
            select: {
              customerId: true,
            },
          },
        },
      });

    if (!payment) {
      throw new NotFoundException(
        'Payment associated with callback not found',
      );
    }

    // ------------------------------------------------
    // Idempotency
    // ------------------------------------------------

    if (
      payment.status ===
      PaymentStatus.PAID
    ) {
      return {
        success: true,

        message:
          'Payment already processed',
      };
    }

    // ------------------------------------------------
    // Successful callback
    // ------------------------------------------------

    if (
      status === 'success' ||
      status === 'successful' ||
      status === 'paid' ||
      status === 'completed'
    ) {
      await this.prisma.payment.update({
        where: {
          id: payment.id,
        },

        data: {
          status:
            PaymentStatus.PAID,

          paidAt:
            payment.paidAt ??
            new Date(),

          gatewayReference:
            reference ??
            payment.gatewayReference,
        },
      });

      // ------------------------------------------------
      // AUTOMATIC PAYMENT NOTIFICATION
      // ------------------------------------------------

      await this.notificationsService.createNotification({
        userId:
          payment.booking.customerId,

        type:
          NotificationType.PAYMENT_RECEIVED,

        message:
          `Payment of ${Number(payment.amount).toFixed(2)} ETB has been received successfully.`,
      });

      return {
        success: true,

        message:
          'Payment marked as paid',
      };
    }

    // ------------------------------------------------
    // Failed / cancelled callback
    // ------------------------------------------------

    if (
      status === 'failed' ||
      status === 'cancelled' ||
      status === 'canceled'
    ) {
      await this.prisma.payment.update({
        where: {
          id: payment.id,
        },

        data: {
          status:
            PaymentStatus.FAILED,

          gatewayReference:
            reference ??
            payment.gatewayReference,
        },
      });

      return {
        success: true,

        message:
          'Payment marked as failed',
      };
    }

    // ------------------------------------------------
    // Pending / unknown status
    // ------------------------------------------------

    return {
      success: true,

      message:
        'Payment status received but not finalized',

      status:
        payment.status,

      chapaStatus:
        status ?? 'unknown',
    };
  }

  // ==================================================
  // CUSTOMER — MY PAYMENTS
  // ==================================================

  async findMyPayments(
    customerId: string,
  ) {
    return this.prisma.payment.findMany({
      where: {
        booking: {
          customerId,
        },
      },

      select: {
        id: true,
        amount: true,
        paymentType: true,
        paymentMethod: true,
        status: true,
        txRef: true,
        gatewayReference: true,
        paidAt: true,
        createdAt: true,
        updatedAt: true,

        booking: {
          select: {
            id: true,
            bookingReference: true,
            checkIn: true,
            checkOut: true,
            status: true,
            totalAmount: true,
          },
        },
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // ==================================================
  // ADMIN — ALL PAYMENTS
  // ==================================================

  async findAllPayments(
    filters: PaymentFilterDto,
  ) {
    const where: {
      status?: PaymentStatus;

      paymentMethod?: PaymentMethod;

      createdAt?: {
        gte?: Date;
        lte?: Date;
      };
    } = {};

    if (filters.status) {
      where.status =
        filters.status;
    }

    if (filters.paymentMethod) {
      where.paymentMethod =
        filters.paymentMethod;
    }

    if (
      filters.from ||
      filters.to
    ) {
      where.createdAt = {};

      if (filters.from) {
        where.createdAt.gte =
          new Date(filters.from);
      }

      if (filters.to) {
        const toDate =
          new Date(filters.to);

        toDate.setHours(
          23,
          59,
          59,
          999,
        );

        where.createdAt.lte =
          toDate;
      }
    }

    return this.prisma.payment.findMany({
      where,

      select: {
        id: true,
        amount: true,
        paymentType: true,
        paymentMethod: true,
        status: true,
        txRef: true,
        gatewayReference: true,
        paidAt: true,
        createdAt: true,
        updatedAt: true,

        booking: {
          select: {
            id: true,
            bookingReference: true,
            checkIn: true,
            checkOut: true,
            status: true,
            totalAmount: true,

            customer: {
              select: {
                id: true,
                fullName: true,
                phone: true,
                email: true,
              },
            },
          },
        },
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // ==================================================
  // ADMIN — PAYMENT DETAILS
  // ==================================================

  async findPaymentById(
    paymentId: string,
  ) {
    const payment =
      await this.prisma.payment.findUnique({
        where: {
          id: paymentId,
        },

        select: {
          id: true,
          amount: true,
          paymentType: true,
          paymentMethod: true,
          status: true,
          txRef: true,
          gatewayReference: true,
          paidAt: true,
          createdAt: true,
          updatedAt: true,

          booking: {
            select: {
              id: true,
              bookingReference: true,
              checkIn: true,
              checkOut: true,
              status: true,
              totalAmount: true,

              customer: {
                select: {
                  id: true,
                  fullName: true,
                  phone: true,
                  email: true,
                },
              },

              payments: {
                select: {
                  id: true,
                  amount: true,
                  paymentType: true,
                  paymentMethod: true,
                  status: true,
                  txRef: true,
                  gatewayReference: true,
                  paidAt: true,
                  createdAt: true,
                },

                orderBy: {
                  createdAt: 'asc',
                },
              },
            },
          },
        },
      });

    if (!payment) {
      throw new NotFoundException(
        'Payment not found',
      );
    }

    const totalAmount =
      Number(
        payment.booking.totalAmount,
      );

    const paidAmount =
      payment.booking.payments
        .filter(
          (item) =>
            item.status ===
            PaymentStatus.PAID,
        )
        .reduce(
          (sum, item) =>
            sum + Number(item.amount),
          0,
        );

    const balanceDue =
      Math.max(
        totalAmount - paidAmount,
        0,
      );

    return {
      ...payment,

      paymentSummary: {
        totalAmount,

        paidAmount:
          Number(
            paidAmount.toFixed(2),
          ),

        balanceDue:
          Number(
            balanceDue.toFixed(2),
          ),
      },
    };
  }

  // ==================================================
  // ADMIN — MANUAL CASH / BANK PAYMENT
  // ==================================================

  async createManualPayment(
    dto: ManualPaymentDto,
  ) {
    if (
      dto.paymentMethod !==
        PaymentMethod.CASH &&
      dto.paymentMethod !==
        PaymentMethod.BANK_TRANSFER
    ) {
      throw new BadRequestException(
        'Manual payment only supports CASH or BANK_TRANSFER',
      );
    }

    const booking =
      await this.prisma.booking.findUnique({
        where: {
          id: dto.bookingId,
        },

        include: {
          payments: {
            select: {
              amount: true,
              status: true,
            },
          },
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
        'Cancelled booking cannot receive payment',
      );
    }

    if (
      booking.status ===
      BookingStatus.CHECKED_OUT
    ) {
      throw new ConflictException(
        'Checked-out booking cannot receive payment',
      );
    }

    const totalAmount =
      Number(
        booking.totalAmount,
      );

    const alreadyPaid =
      booking.payments
        .filter(
          (payment) =>
            payment.status ===
            PaymentStatus.PAID,
        )
        .reduce(
          (sum, payment) =>
            sum + Number(payment.amount),
          0,
        );

    const balance =
      Math.max(
        totalAmount - alreadyPaid,
        0,
      );

    if (dto.amount <= 0) {
      throw new BadRequestException(
        'Payment amount must be greater than zero',
      );
    }

    if (dto.amount > balance) {
      throw new BadRequestException(
        `Payment amount cannot exceed remaining balance of ${balance.toFixed(2)} ETB`,
      );
    }

    const txRef =
      this.generateManualReference();

    const payment =
      await this.prisma.payment.create({
        data: {
          bookingId:
            booking.id,

          amount:
            Number(
              dto.amount.toFixed(2),
            ),

          paymentType:
            dto.paymentType,

          paymentMethod:
            dto.paymentMethod,

          status:
            PaymentStatus.PAID,

          txRef,

          gatewayReference:
            dto.reference,

          paidAt:
            new Date(),
        },
      });

    // ------------------------------------------------
    // AUTOMATIC PAYMENT NOTIFICATION
    // ------------------------------------------------

    await this.notificationsService.createNotification({
      userId:
        booking.customerId,

      type:
        NotificationType.PAYMENT_RECEIVED,

      message:
        `Payment of ${Number(dto.amount).toFixed(2)} ETB has been received successfully.`,
    });

    const newBalance =
      Math.max(
        balance - dto.amount,
        0,
      );

    return {
      success: true,

      message:
        'Manual payment recorded successfully',

      payment: {
        id:
          payment.id,

        bookingId:
          payment.bookingId,

        amount:
          payment.amount,

        paymentType:
          payment.paymentType,

        paymentMethod:
          payment.paymentMethod,

        status:
          payment.status,

        txRef:
          payment.txRef,

        reference:
          payment.gatewayReference,

        paidAt:
          payment.paidAt,
      },

      paymentSummary: {
        totalAmount,

        previousPaid:
          Number(
            alreadyPaid.toFixed(2),
          ),

        currentPayment:
          Number(
            dto.amount.toFixed(2),
          ),

        remainingBalance:
          Number(
            newBalance.toFixed(2),
          ),
      },
    };
  }

  // ==================================================
  // CALCULATE ONLINE PAYMENT AMOUNT
  // ==================================================

  private calculatePaymentAmount(
    totalAmount: unknown,

    payments: {
      amount: unknown;
      status: PaymentStatus;
    }[],

    paymentType: PaymentType,
  ): number {
    const total =
      Number(totalAmount);

    const alreadyPaid =
      payments
        .filter(
          (payment) =>
            payment.status ===
            PaymentStatus.PAID,
        )
        .reduce(
          (sum, payment) =>
            sum + Number(payment.amount),
          0,
        );

    const balance =
      Math.max(
        total - alreadyPaid,
        0,
      );

    switch (paymentType) {
      case PaymentType.DEPOSIT:
        return Number(
          Math.min(
            balance,
            total * 0.3,
          ).toFixed(2),
        );

      case PaymentType.BALANCE:
      case PaymentType.FULL_PAYMENT:
        return Number(
          balance.toFixed(2),
        );

      default:
        throw new BadRequestException(
          'Unsupported payment type',
        );
    }
  }

  // ==================================================
  // TRANSACTION REFERENCE
  // ==================================================

  private generateTransactionReference(): string {
    return `HOTEL-${Date.now()}-${randomUUID().slice(0, 8)}`;
  }

  // ==================================================
  // MANUAL PAYMENT REFERENCE
  // ==================================================

  private generateManualReference(): string {
    return `MANUAL-${Date.now()}-${randomUUID().slice(0, 8)}`;
  }

  // ==================================================
  // NAME HELPERS
  // ==================================================

  private getFirstName(
    fullName: string,
  ): string {
    const parts =
      fullName.trim().split(/\s+/);

    return parts[0] ?? 'Guest';
  }

  private getLastName(
    fullName: string,
  ): string {
    const parts =
      fullName.trim().split(/\s+/);

    if (parts.length <= 1) {
      return 'Guest';
    }

    return parts
      .slice(1)
      .join(' ');
  }

  // ==================================================
  // REQUIRED ENVIRONMENT VARIABLE
  // ==================================================

  private getRequiredConfig(
    name: string,
  ): string {
    const value =
      process.env[name];

    if (!value) {
      throw new Error(
        `${name} must be defined in .env`,
      );
    }

    return value;
  }
}
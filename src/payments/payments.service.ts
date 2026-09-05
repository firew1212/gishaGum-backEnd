import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { randomUUID } from 'node:crypto';

import {
  BookingStatus,
  NotificationType,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '../../generated/prisma/client.js';

import { PrismaService } from '../prisma/prisma.service.js';

import { NotificationsService } from '../notifications/notifications.service.js';

import { ChapaService } from './chapa/chapa.service.js';

import { InitializePaymentDto } from './dto/initialize-payment.dto.js';
import { ManualPaymentDto } from './dto/manual-payment.dto.js';
import { PaymentFilterDto } from './dto/payment-filter.dto.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chapaService: ChapaService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  // ==================================================
  // CUSTOMER — INITIALIZE CHAPA PAYMENT
  // ==================================================

  async initializePayment(customerId: string, dto: InitializePaymentDto) {
    // CASH and BANK_TRANSFER are manual payments.
    if (
      dto.paymentMethod === PaymentMethod.CASH ||
      dto.paymentMethod === PaymentMethod.BANK_TRANSFER
    ) {
      throw new BadRequestException(
        'Cash and bank transfer payments must be recorded manually.',
      );
    }

    const booking = await this.prisma.booking.findFirst({
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
      throw new NotFoundException('Booking not found.');
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new ConflictException('Cancelled booking cannot receive payment.');
    }

    if (booking.status === BookingStatus.CHECKED_OUT) {
      throw new ConflictException(
        'Checked-out booking cannot receive payment.',
      );
    }

    const amount = this.calculatePaymentAmount(
      booking.totalAmount,
      booking.payments,
      dto.paymentType,
    );

    if (amount <= 0) {
      throw new BadRequestException('No payment is required for this booking.');
    }

    const txRef = this.generateTransactionReference();

    const payment = await this.prisma.payment.create({
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
      const callbackUrl =
        this.configService.getOrThrow<string>('CHAPA_CALLBACK_URL');

      const returnUrl = new URL(
        this.configService.getOrThrow<string>('CHAPA_RETURN_URL'),
      );

      returnUrl.searchParams.set('tx_ref', txRef);

      const chapaResponse = await this.chapaService.initializeTransaction({
        amount: amount.toFixed(2),

        currency: 'ETB',

        email: booking.customer.email ?? undefined,

        first_name: this.getFirstName(booking.customer.fullName),

        last_name: this.getLastName(booking.customer.fullName),

        phone_number: booking.customer.phone,

        tx_ref: txRef,

        callback_url: callbackUrl,

        return_url: returnUrl.toString(),
      });

      const checkoutUrl = chapaResponse.data?.checkout_url;

      if (!checkoutUrl) {
        await this.prisma.payment.update({
          where: {
            id: payment.id,
          },

          data: {
            status: PaymentStatus.FAILED,
          },
        });

        throw new BadGatewayException('Chapa did not return a checkout URL.');
      }

      const gatewayReference = chapaResponse.data?.reference;

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

        message: 'Payment initialized successfully.',

        paymentId: payment.id,

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

  // ==================================================
  // CUSTOMER — VERIFY CHAPA PAYMENT
  // ==================================================

  async verifyPayment(customerId: string, txRef: string) {
    const payment = await this.prisma.payment.findUnique({
      where: {
        txRef,
      },

      include: {
        booking: {
          select: {
            id: true,
            customerId: true,
            bookingReference: true,
            status: true,
            totalAmount: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }

    if (payment.booking.customerId !== customerId) {
      throw new NotFoundException('Payment not found.');
    }

    // ------------------------------------------------
    // IDEMPOTENCY
    // ------------------------------------------------

    if (payment.status === PaymentStatus.PAID) {
      return {
        success: true,

        message: 'Payment already processed.',

        payment: {
          id: payment.id,

          txRef: payment.txRef,

          gatewayReference: payment.gatewayReference,

          amount: payment.amount,

          status: payment.status,

          paidAt: payment.paidAt,
        },

        booking: {
          id: payment.booking.id,

          bookingReference: payment.booking.bookingReference,

          status: payment.booking.status,

          totalAmount: payment.booking.totalAmount,
        },
      };
    }

    if (payment.booking.status === BookingStatus.CANCELLED) {
      throw new ConflictException(
        'Cannot verify payment for a cancelled booking.',
      );
    }

    if (payment.booking.status === BookingStatus.CHECKED_OUT) {
      throw new ConflictException(
        'Cannot verify payment for a checked-out booking.',
      );
    }

    // ------------------------------------------------
    // VERIFY DIRECTLY WITH CHAPA
    // ------------------------------------------------

    const chapaResponse = await this.chapaService.verifyTransaction(txRef);

    const chapaPayment = this.extractChapaVerification(chapaResponse);

    // ------------------------------------------------
    // SECURITY VALIDATION
    // ------------------------------------------------

    this.validateChapaPayment(payment.txRef, payment.amount, chapaPayment);

    const chapaStatus = this.getChapaStatus(chapaPayment);

    const gatewayReference = chapaPayment.reference;

    // ------------------------------------------------
    // SUCCESSFUL PAYMENT
    // ------------------------------------------------

    if (this.isSuccessfulChapaStatus(chapaStatus)) {
      const result = await this.prisma.$transaction(async (transaction) => {
        const currentPayment = await transaction.payment.findUnique({
          where: {
            id: payment.id,
          },
        });

        if (!currentPayment) {
          throw new NotFoundException('Payment not found.');
        }

        // Protect against duplicate
        // verification requests.
        if (currentPayment.status === PaymentStatus.PAID) {
          const currentBooking = await transaction.booking.findUnique({
            where: {
              id: payment.booking.id,
            },

            select: {
              id: true,
              bookingReference: true,
              status: true,
              totalAmount: true,
            },
          });

          return {
            updatedPayment: currentPayment,

            updatedBooking: currentBooking,

            alreadyProcessed: true,
          };
        }

        const updatedPayment = await transaction.payment.update({
          where: {
            id: payment.id,
          },

          data: {
            status: PaymentStatus.PAID,

            paidAt: currentPayment.paidAt ?? new Date(),

            gatewayReference:
              gatewayReference ?? currentPayment.gatewayReference,
          },
        });

        const updatedBooking = await transaction.booking.update({
          where: {
            id: payment.booking.id,
          },

          data: {
            status: BookingStatus.CONFIRMED,
          },

          select: {
            id: true,
            bookingReference: true,
            status: true,
            totalAmount: true,
          },
        });

        return {
          updatedPayment,

          updatedBooking,

          alreadyProcessed: false,
        };
      });

      // Do not create duplicate notification.
      if (!result.alreadyProcessed) {
        await this.notificationsService.createNotification({
          userId: payment.booking.customerId,

          type: NotificationType.PAYMENT_RECEIVED,

          message: `Payment of ${Number(payment.amount).toFixed(2)} ETB has been received successfully.`,
        });
      }

      return {
        success: true,

        message: result.alreadyProcessed
          ? 'Payment already processed.'
          : 'Payment verified successfully.',

        payment: {
          id: result.updatedPayment.id,

          txRef: result.updatedPayment.txRef,

          gatewayReference: result.updatedPayment.gatewayReference,

          amount: result.updatedPayment.amount,

          status: result.updatedPayment.status,

          paidAt: result.updatedPayment.paidAt,
        },

        booking: {
          id: result.updatedBooking!.id,

          bookingReference: result.updatedBooking!.bookingReference,

          status: result.updatedBooking!.status,

          totalAmount: result.updatedBooking!.totalAmount,
        },

        chapaStatus,
      };
    }

    // ------------------------------------------------
    // FAILED / CANCELLED PAYMENT
    // ------------------------------------------------

    if (this.isFailedChapaStatus(chapaStatus)) {
      const updatedPayment = await this.prisma.payment.update({
        where: {
          id: payment.id,
        },

        data: {
          status: PaymentStatus.FAILED,

          gatewayReference: gatewayReference ?? payment.gatewayReference,
        },
      });

      return {
        success: false,

        message: 'Payment failed or was cancelled.',

        payment: {
          id: updatedPayment.id,

          txRef: updatedPayment.txRef,

          gatewayReference: updatedPayment.gatewayReference,

          amount: updatedPayment.amount,

          status: updatedPayment.status,

          paidAt: updatedPayment.paidAt,
        },

        booking: {
          id: payment.booking.id,

          bookingReference: payment.booking.bookingReference,

          status: payment.booking.status,

          totalAmount: payment.booking.totalAmount,
        },

        chapaStatus,
      };
    }

    // ------------------------------------------------
    // STILL PENDING
    // ------------------------------------------------

    return {
      success: false,

      message: 'Payment is still pending.',

      payment: {
        id: payment.id,

        txRef: payment.txRef,

        gatewayReference: payment.gatewayReference,

        amount: payment.amount,

        status: payment.status,

        paidAt: payment.paidAt,
      },

      booking: {
        id: payment.booking.id,

        bookingReference: payment.booking.bookingReference,

        status: payment.booking.status,

        totalAmount: payment.booking.totalAmount,
      },

      chapaStatus: chapaStatus || 'unknown',
    };
  }

  // ==================================================
  // CHAPA — CALLBACK
  // ==================================================

  async handleChapaCallback(body: unknown) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Invalid Chapa callback payload.');
    }

    const payload = body as Record<string, unknown>;

    const txRef =
      typeof payload.trx_ref === 'string'
        ? payload.trx_ref.trim()
        : typeof payload.tx_ref === 'string'
          ? payload.tx_ref.trim()
          : undefined;

    if (!txRef) {
      throw new BadRequestException(
        'Chapa callback does not contain transaction reference.',
      );
    }

    const payment = await this.prisma.payment.findUnique({
      where: {
        txRef,
      },

      include: {
        booking: {
          select: {
            id: true,
            customerId: true,
            bookingReference: true,
            status: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException(
        'Payment associated with callback not found.',
      );
    }

    // ------------------------------------------------
    // IDEMPOTENCY
    // ------------------------------------------------

    if (payment.status === PaymentStatus.PAID) {
      return {
        success: true,

        message: 'Payment already processed.',
      };
    }

    // ------------------------------------------------
    // NEVER TRUST CALLBACK STATUS
    // ------------------------------------------------

    const chapaResponse = await this.chapaService.verifyTransaction(txRef);

    const chapaPayment = this.extractChapaVerification(chapaResponse);

    // ------------------------------------------------
    // SECURITY VALIDATION
    // ------------------------------------------------

    this.validateChapaPayment(payment.txRef, payment.amount, chapaPayment);

    const chapaStatus = this.getChapaStatus(chapaPayment);

    // ------------------------------------------------
    // SUCCESSFUL PAYMENT
    // ------------------------------------------------

    if (this.isSuccessfulChapaStatus(chapaStatus)) {
      const result = await this.prisma.$transaction(async (transaction) => {
        const currentPayment = await transaction.payment.findUnique({
          where: {
            id: payment.id,
          },
        });

        if (!currentPayment) {
          throw new NotFoundException('Payment not found.');
        }

        if (currentPayment.status === PaymentStatus.PAID) {
          return {
            alreadyProcessed: true,
          };
        }

        await transaction.payment.update({
          where: {
            id: payment.id,
          },

          data: {
            status: PaymentStatus.PAID,

            paidAt: currentPayment.paidAt ?? new Date(),

            gatewayReference:
              chapaPayment.reference ?? currentPayment.gatewayReference,
          },
        });

        await transaction.booking.update({
          where: {
            id: payment.booking.id,
          },

          data: {
            status: BookingStatus.CONFIRMED,
          },
        });

        return {
          alreadyProcessed: false,
        };
      });

      if (!result.alreadyProcessed) {
        await this.notificationsService.createNotification({
          userId: payment.booking.customerId,

          type: NotificationType.PAYMENT_RECEIVED,

          message: `Payment of ${Number(payment.amount).toFixed(2)} ETB has been received successfully.`,
        });
      }

      return {
        success: true,

        message: result.alreadyProcessed
          ? 'Payment already processed.'
          : 'Payment verified and booking confirmed.',

        txRef,

        status: PaymentStatus.PAID,

        chapaStatus,
      };
    }

    // ------------------------------------------------
    // FAILED / CANCELLED PAYMENT
    // ------------------------------------------------

    if (this.isFailedChapaStatus(chapaStatus)) {
      await this.prisma.payment.update({
        where: {
          id: payment.id,
        },

        data: {
          status: PaymentStatus.FAILED,

          gatewayReference: chapaPayment.reference ?? payment.gatewayReference,
        },
      });

      return {
        success: true,

        message: 'Payment marked as failed.',

        txRef,

        status: PaymentStatus.FAILED,

        chapaStatus,
      };
    }

    // ------------------------------------------------
    // PENDING / UNKNOWN
    // ------------------------------------------------

    return {
      success: true,

      message: 'Payment status received but not finalized.',

      txRef,

      status: payment.status,

      chapaStatus: chapaStatus || 'unknown',
    };
  }

  // ==================================================
  // CUSTOMER — MY PAYMENTS
  // ==================================================

  async findMyPayments(customerId: string) {
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

  async findAllPayments(filters: PaymentFilterDto) {
    const where: {
      status?: PaymentStatus;

      paymentMethod?: PaymentMethod;

      createdAt?: {
        gte?: Date;
        lte?: Date;
      };
    } = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.paymentMethod) {
      where.paymentMethod = filters.paymentMethod;
    }

    if (filters.from || filters.to) {
      where.createdAt = {};

      if (filters.from) {
        where.createdAt.gte = new Date(filters.from);
      }

      if (filters.to) {
        const toDate = new Date(filters.to);

        toDate.setHours(23, 59, 59, 999);

        where.createdAt.lte = toDate;
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

  async findPaymentById(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
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
      throw new NotFoundException('Payment not found.');
    }

    const totalAmount = Number(payment.booking.totalAmount);

    const paidAmount = payment.booking.payments
      .filter((item) => item.status === PaymentStatus.PAID)
      .reduce((sum, item) => sum + Number(item.amount), 0);

    const balanceDue = Math.max(totalAmount - paidAmount, 0);

    return {
      ...payment,

      paymentSummary: {
        totalAmount,

        paidAmount: Number(paidAmount.toFixed(2)),

        balanceDue: Number(balanceDue.toFixed(2)),
      },
    };
  }

  // ==================================================
  // ADMIN — MANUAL CASH / BANK PAYMENT
  // ==================================================

  async createManualPayment(dto: ManualPaymentDto) {
    if (
      dto.paymentMethod !== PaymentMethod.CASH &&
      dto.paymentMethod !== PaymentMethod.BANK_TRANSFER
    ) {
      throw new BadRequestException(
        'Manual payment only supports CASH or BANK_TRANSFER.',
      );
    }

    const booking = await this.prisma.booking.findUnique({
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
      throw new NotFoundException('Booking not found.');
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new ConflictException('Cancelled booking cannot receive payment.');
    }

    if (booking.status === BookingStatus.CHECKED_OUT) {
      throw new ConflictException(
        'Checked-out booking cannot receive payment.',
      );
    }

    const totalAmount = Number(booking.totalAmount);

    const alreadyPaid = booking.payments
      .filter((payment) => payment.status === PaymentStatus.PAID)
      .reduce((sum, payment) => sum + Number(payment.amount), 0);

    const balance = Math.max(totalAmount - alreadyPaid, 0);

    if (dto.amount <= 0) {
      throw new BadRequestException(
        'Payment amount must be greater than zero.',
      );
    }

    if (dto.amount > balance) {
      throw new BadRequestException(
        `Payment amount cannot exceed remaining balance of ${balance.toFixed(2)} ETB.`,
      );
    }

    const txRef = this.generateManualReference();

    const payment = await this.prisma.$transaction(async (transaction) => {
      const createdPayment = await transaction.payment.create({
        data: {
          bookingId: booking.id,

          amount: Number(dto.amount.toFixed(2)),

          paymentType: dto.paymentType,

          paymentMethod: dto.paymentMethod,

          status: PaymentStatus.PAID,

          txRef,

          gatewayReference: dto.reference,

          paidAt: new Date(),
        },
      });

      // Successful payment confirms
      // the booking.
      //
      // Room occupancy is handled
      // by the check-in process.
      await transaction.booking.update({
        where: {
          id: booking.id,
        },

        data: {
          status: BookingStatus.CONFIRMED,
        },
      });

      return createdPayment;
    });

    await this.notificationsService.createNotification({
      userId: booking.customerId,

      type: NotificationType.PAYMENT_RECEIVED,

      message: `Payment of ${Number(dto.amount).toFixed(2)} ETB has been received successfully.`,
    });

    const newBalance = Math.max(balance - dto.amount, 0);

    return {
      success: true,

      message: 'Manual payment recorded successfully.',

      payment: {
        id: payment.id,

        bookingId: payment.bookingId,

        amount: payment.amount,

        paymentType: payment.paymentType,

        paymentMethod: payment.paymentMethod,

        status: payment.status,

        txRef: payment.txRef,

        reference: payment.gatewayReference,

        paidAt: payment.paidAt,
      },

      paymentSummary: {
        totalAmount,

        previousPaid: Number(alreadyPaid.toFixed(2)),

        currentPayment: Number(dto.amount.toFixed(2)),

        remainingBalance: Number(newBalance.toFixed(2)),
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
    const total = Number(totalAmount);

    if (!Number.isFinite(total) || total <= 0) {
      throw new BadRequestException('Invalid booking total amount.');
    }

    const alreadyPaid = payments
      .filter((payment) => payment.status === PaymentStatus.PAID)
      .reduce((sum, payment) => sum + Number(payment.amount), 0);

    const balance = Math.max(total - alreadyPaid, 0);

    switch (paymentType) {
      case PaymentType.DEPOSIT:
        return Number(Math.min(balance, total * 0.3).toFixed(2));

      case PaymentType.BALANCE:
      case PaymentType.FULL_PAYMENT:
        return Number(balance.toFixed(2));

      default:
        throw new BadRequestException('Unsupported payment type.');
    }
  }

  // ==================================================
  // CHAPA VERIFICATION
  // ==================================================

  private extractChapaVerification(response: unknown): ChapaVerification {
    if (!response || typeof response !== 'object') {
      throw new BadGatewayException('Invalid response received from Chapa.');
    }

    const root = response as Record<string, unknown>;

    const data =
      root.data && typeof root.data === 'object'
        ? (root.data as Record<string, unknown>)
        : root;

    return {
      status: typeof data.status === 'string' ? data.status : undefined,

      tx_ref:
        typeof data.tx_ref === 'string'
          ? data.tx_ref
          : typeof data.trx_ref === 'string'
            ? data.trx_ref
            : undefined,

      reference:
        typeof data.reference === 'string' ? data.reference : undefined,

      amount:
        typeof data.amount === 'number' || typeof data.amount === 'string'
          ? data.amount
          : undefined,

      currency: typeof data.currency === 'string' ? data.currency : undefined,
    };
  }

  // ==================================================
  // PAYMENT SECURITY VALIDATION
  // ==================================================

  private validateChapaPayment(
    expectedTxRef: string,
    expectedAmount: unknown,
    chapaPayment: ChapaVerification,
  ) {
    // ------------------------------------------------
    // TRANSACTION REFERENCE
    // ------------------------------------------------

    const chapaTxRef = chapaPayment.tx_ref?.trim();

    if (!chapaTxRef || chapaTxRef !== expectedTxRef) {
      throw new BadGatewayException(
        'Payment verification failed: transaction reference mismatch.',
      );
    }

    // ------------------------------------------------
    // CURRENCY
    // ------------------------------------------------

    const chapaCurrency = chapaPayment.currency?.trim().toUpperCase();

    if (chapaCurrency !== 'ETB') {
      throw new BadGatewayException(
        'Payment verification failed: currency mismatch.',
      );
    }

    // ------------------------------------------------
    // AMOUNT
    // ------------------------------------------------

    const actualAmount = Number(chapaPayment.amount);

    const expected = Number(expectedAmount);

    if (!Number.isFinite(actualAmount) || !Number.isFinite(expected)) {
      throw new BadGatewayException(
        'Payment verification failed: invalid payment amount.',
      );
    }

    const normalizedActual = Number(actualAmount.toFixed(2));

    const normalizedExpected = Number(expected.toFixed(2));

    if (normalizedActual !== normalizedExpected) {
      throw new BadGatewayException(
        'Payment verification failed: payment amount mismatch.',
      );
    }
  }

  // ==================================================
  // CHAPA STATUS HELPERS
  // ==================================================

  private getChapaStatus(chapaPayment: ChapaVerification): string {
    return chapaPayment.status?.trim().toLowerCase() ?? '';
  }

  private isSuccessfulChapaStatus(status: string): boolean {
    return ['success', 'successful', 'paid', 'completed'].includes(status);
  }

  private isFailedChapaStatus(status: string): boolean {
    return ['failed', 'cancelled', 'canceled'].includes(status);
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

  private getFirstName(fullName: string): string {
    const parts = fullName.trim().split(/\s+/);

    return parts[0] ?? 'Guest';
  }

  private getLastName(fullName: string): string {
    const parts = fullName.trim().split(/\s+/);

    if (parts.length <= 1) {
      return 'Guest';
    }

    return parts.slice(1).join(' ');
  }
}

// ==================================================
// CHAPA VERIFICATION TYPE
// ==================================================

interface ChapaVerification {
  status?: string;
  tx_ref?: string;
  reference?: string;
  amount?: string | number;
  currency?: string;
}

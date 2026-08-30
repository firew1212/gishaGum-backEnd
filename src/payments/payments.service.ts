import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import {
  BookingStatus,
  PaymentStatus,
  PaymentType,
  RefundStatus,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

import { ChapaService } from './chapa/chapa.service.js';

import { InitializePaymentDto } from './dto/initialize-payment.dto.js';
import { RefundPaymentDto } from './dto/refund-payment.dto.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chapaService: ChapaService,
    private readonly configService: ConfigService,
  ) {}

  // ==================================================
  // CUSTOMER — INITIALIZE PAYMENT
  // ==================================================

  async initializePayment(
    customerId: string,
    dto: InitializePaymentDto,
  ) {
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

    // Cancelled bookings cannot be paid.
    if (
      booking.status ===
      BookingStatus.CANCELLED
    ) {
      throw new ConflictException(
        'Cancelled booking cannot receive payment',
      );
    }

    // Checked-out bookings cannot receive payment.
    if (
      booking.status ===
      BookingStatus.CHECKED_OUT
    ) {
      throw new ConflictException(
        'Checked-out booking cannot receive payment',
      );
    }

    // Calculate amount on the server.
    const amount =
      this.calculatePaymentAmount(
        booking.totalAmount,
        booking.payments,
        dto.paymentType,
      );

    if (amount <= 0) {
      throw new BadRequestException(
        'No payment is required',
      );
    }

    // Generate our own unique transaction reference.
    const txRef =
      this.generateTransactionReference();

    // Create local payment first.
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
      // Send payment initialization request to Chapa.
      const chapaResponse =
        await this.chapaService.initializeTransaction(
          {
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
              this.configService.getOrThrow<string>(
                'CHAPA_CALLBACK_URL',
              ),

            return_url:
              this.configService.getOrThrow<string>(
                'CHAPA_RETURN_URL',
              ),
          },
        );

      const checkoutUrl =
        chapaResponse.data?.checkout_url;

      
      if (!checkoutUrl) {
        throw new BadGatewayException(
          'Chapa did not return a checkout URL',
        );
      }

     

      // Save Chapa's own payment reference.
      

      return {
        paymentId: payment.id,
        txRef,
        checkoutUrl,
      };
    } catch (error) {
      // If Chapa initialization fails,
      // mark the local payment as failed.
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
  // CUSTOMER — VERIFY PAYMENT
  // ==================================================

  async verifyPayment(
    customerId: string,
    txRef: string,
  ) {
    const payment =
      await this.prisma.payment.findFirst({
        where: {
          txRef,
          booking: {
            customerId,
          },
        },
      });

    if (!payment) {
      throw new NotFoundException(
        'Payment not found',
      );
    }

    // Already paid.
    if (
      payment.status === PaymentStatus.PAID
    ) {
      return payment;
    }

    // Already refunded.
    if (
      payment.status ===
      PaymentStatus.REFUNDED
    ) {
      throw new ConflictException(
        'This payment has already been refunded',
      );
    }

    const chapaResponse =
      await this.chapaService.verifyTransaction(
        txRef,
      );

    const chapaData =
      chapaResponse.data;

    if (!chapaData) {
      throw new BadGatewayException(
        'Invalid Chapa verification response',
      );
    }

    // Verify transaction reference.
    if (
      chapaData.tx_ref &&
      chapaData.tx_ref !== txRef
    ) {
      throw new ConflictException(
        'Transaction reference does not match',
      );
    }

    // Verify amount.
    if (
      chapaData.amount !== undefined &&
      Number(chapaData.amount) !==
        Number(payment.amount)
    ) {
      throw new ConflictException(
        'Payment amount does not match',
      );
    }

    // Payment successful.
    if (
      chapaData.status === 'success'
    ) {
      const updated =
        await this.prisma.payment.updateMany({
          where: {
            id: payment.id,
            status: PaymentStatus.PENDING,
          },
          data: {
            status: PaymentStatus.PAID,
            paidAt: new Date(),
          },
        });

      if (updated.count === 0) {
        return this.prisma.payment.findUnique({
          where: {
            id: payment.id,
          },
        });
      }

      return this.prisma.payment.findUnique({
        where: {
          id: payment.id,
        },
      });
    }

    // Payment failed or cancelled.
    if (
      chapaData.status === 'failed' ||
      chapaData.status === 'cancelled'
    ) {
      const updated =
        await this.prisma.payment.updateMany({
          where: {
            id: payment.id,
            status: PaymentStatus.PENDING,
          },
          data: {
            status: PaymentStatus.FAILED,
          },
        });

      if (updated.count === 0) {
        return this.prisma.payment.findUnique({
          where: {
            id: payment.id,
          },
        });
      }

      return this.prisma.payment.findUnique({
        where: {
          id: payment.id,
        },
      });
    }

    // Payment is still pending/unknown.
    return {
      paymentId: payment.id,
      txRef,
      status: payment.status,
      chapaStatus: chapaData.status,
    };
  }

  // ==================================================
  // CALCULATE PAYMENT AMOUNT
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
      case PaymentType.FULL_PAYMENT:
      case PaymentType.BALANCE:
        return Number(
          balance.toFixed(2),
        );

      case PaymentType.DEPOSIT:
        return Number(
          (balance * 0.3).toFixed(2),
        );

      default:
        throw new BadRequestException(
          'Unsupported payment type',
        );
    }
  }

  // ==================================================
  // GENERATE TRANSACTION REFERENCE
  // ==================================================

  private generateTransactionReference(): string {
    return `HOTEL-${Date.now()}-${randomUUID().slice(0, 8)}`;
  }

  // ==================================================
  // CUSTOMER NAME HELPERS
  // ==================================================

  private getFirstName(
    fullName: string,
  ): string {
    return (
      fullName.trim().split(/\s+/)[0] ||
      'Guest'
    );
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
  // CHAPA CALLBACK / WEBHOOK
  // ==================================================

  async handleChapaCallback(
    body: unknown,
  ) {
    const payload = body as {
      tx_ref?: string;
    };

    const txRef = payload.tx_ref;

    if (!txRef) {
      throw new BadRequestException(
        'Transaction reference is required',
      );
    }

    // Never trust callback status.
    // Verify directly with Chapa.
    const chapaResponse =
      await this.chapaService.verifyTransaction(
        txRef,
      );

    const chapaData =
      chapaResponse.data;

    if (!chapaData) {
      throw new BadGatewayException(
        'Invalid Chapa transaction response',
      );
    }

    const payment =
      await this.prisma.payment.findUnique({
        where: {
          txRef,
        },
      });

    if (!payment) {
      throw new NotFoundException(
        'Payment not found',
      );
    }

    // Idempotency.
    if (
      payment.status === PaymentStatus.PAID
    ) {
      return {
        success: true,
        message: 'Payment already processed',
      };
    }

    // Verify amount.
    if (
      chapaData.amount !== undefined &&
      Number(chapaData.amount) !==
        Number(payment.amount)
    ) {
      throw new ConflictException(
        'Payment amount does not match',
      );
    }

    // Successful payment.
    if (
      chapaData.status === 'success'
    ) {
      await this.prisma.payment.updateMany({
        where: {
          id: payment.id,
          status: PaymentStatus.PENDING,
        },
        data: {
          status: PaymentStatus.PAID,
          paidAt: new Date(),
        },
      });

      return {
        success: true,
        status: PaymentStatus.PAID,
      };
    }

    // Failed payment.
    if (
      chapaData.status === 'failed' ||
      chapaData.status === 'cancelled'
    ) {
      await this.prisma.payment.updateMany({
        where: {
          id: payment.id,
          status: PaymentStatus.PENDING,
        },
        data: {
          status: PaymentStatus.FAILED,
        },
      });

      return {
        success: true,
        status: PaymentStatus.FAILED,
      };
    }

    return {
      success: true,
      status: payment.status,
      chapaStatus: chapaData.status,
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

        paidAt: true,
        createdAt: true,

        booking: {
          select: {
            id: true,
            bookingReference: true,
            checkIn: true,
            checkOut: true,
            status: true,
          },
        },
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // ==================================================
  // ADMIN / CASHIER — ALL PAYMENTS
  // ==================================================

  async findAllPayments() {
    return this.prisma.payment.findMany({
      select: {
        id: true,
        amount: true,
        paymentType: true,
        paymentMethod: true,
        status: true,

        txRef: true,
        gatewayReference: true,

        refundReference: true,
        refundStatus: true,

        paidAt: true,
        refundedAt: true,

        createdAt: true,
        updatedAt: true,

        booking: {
          select: {
            id: true,
            bookingReference: true,
            checkIn: true,
            checkOut: true,
            status: true,

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
  // ADMIN / CASHIER — SINGLE PAYMENT
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

          refundReference: true,
          refundStatus: true,

          paidAt: true,
          refundedAt: true,

          createdAt: true,
          updatedAt: true,

          booking: {
            select: {
              id: true,
              bookingReference: true,
              checkIn: true,
              checkOut: true,
              status: true,

              customer: {
                select: {
                  id: true,
                  fullName: true,
                  phone: true,
                  email: true,
                },
              },

              rooms: {
                select: {
                  room: {
                    select: {
                      id: true,
                      roomNumber: true,

                      roomType: {
                        select: {
                          name: true,
                          price: true,
                        },
                      },
                    },
                  },
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

    return payment;
  }

  // ==================================================
  // ADMIN / CASHIER — REFUND PAYMENT
  // ==================================================

  async refundPayment(
    paymentId: string,
    dto: RefundPaymentDto,
  ) {
    // 1. Find payment.
    const payment =
      await this.prisma.payment.findUnique({
        where: {
          id: paymentId,
        },
      });

    if (!payment) {
      throw new NotFoundException(
        'Payment not found',
      );
    }

    // 2. Only PAID payments can be refunded.
    if (
      payment.status !==
      PaymentStatus.PAID
    ) {
      throw new ConflictException(
        'Only paid payments can be refunded',
      );
    }

    // 3. txRef is required by Chapa refund API.
    if (!payment.txRef) {
      throw new BadRequestException(
        'Payment does not have a Chapa transaction reference',
      );
    }

    // 4. Prevent duplicate refunds.
    if (
  payment.refundStatus === RefundStatus.INITIATED ||
  payment.refundStatus === RefundStatus.PROCESSING
) {
      throw new ConflictException(
        'A refund is already being processed',
      );
    }

    // 5. Already refunded.
    if (payment.refundStatus === RefundStatus.REFUNDED) {
      throw new ConflictException(
        'Payment has already been refunded',
      );
    }

    // 6. Calculate refund amount.
    const paidAmount =
      Number(payment.amount);

    const refundAmount =
      dto.amount ?? paidAmount;

    if (refundAmount <= 0) {
      throw new BadRequestException(
        'Refund amount must be greater than zero',
      );
    }

    if (refundAmount > paidAmount) {
      throw new BadRequestException(
        'Refund amount cannot exceed payment amount',
      );
    }

    // 7. Generate our unique refund reference.
    const refundReference =
      `REFUND-${Date.now()}-${randomUUID().slice(0, 8)}`;

    // 8. IMPORTANT:
    // Use payment.txRef here.
    //
    // Chapa refund endpoint:
    // POST /v1/refund/{tx_ref}
    //
    // Do NOT use gatewayReference here.
    const chapaResponse =
      await this.chapaService.initiateRefund(
        payment.txRef,
        {
          amount:
            refundAmount.toFixed(2),

          reason:
            dto.reason ??
            'Hotel booking refund',

          reference:
            refundReference,
        },
      );

    // 9. Chapa must return ref_id.
    const refId =
      chapaResponse.data?.ref_id;

    if (!refId) {
      throw new BadGatewayException(
        'Chapa did not return a refund reference',
      );
    }

    // 10. Save refund information.
    return this.prisma.payment.update({
      where: {
        id: payment.id,
      },

      data: {
        refundReference: refId,

        refundStatus: RefundStatus.INITIATED,
      },
    });
  }

  // ==================================================
  // ADMIN / CASHIER — VERIFY REFUND
  // ==================================================

  async verifyRefund(
    paymentId: string,
  ) {
    // 1. Find payment.
    const payment =
      await this.prisma.payment.findUnique({
        where: {
          id: paymentId,
        },
      });

    if (!payment) {
      throw new NotFoundException(
        'Payment not found',
      );
    }

    // 2. Refund must have been initiated.
    if (!payment.refundReference) {
      throw new ConflictException(
        'No refund has been initiated for this payment',
      );
    }

    // 3. Verify using Chapa's refund ref_id.
    const chapaResponse =
      await this.chapaService.verifyRefund(
        payment.refundReference,
      );

    const refundStatus =
      chapaResponse.data?.status;

    if (!refundStatus) {
      throw new BadGatewayException(
        'Chapa did not return refund status',
      );
    }

    // 4. Refund completed.
    if (
      refundStatus === 'refunded'
    ) {
      return this.prisma.payment.update({
        where: {
          id: payment.id,
        },

        data: {
          status:
            PaymentStatus.REFUNDED,

          refundStatus: RefundStatus.REFUNDED,

          refundedAt:
            payment.refundedAt ??
            new Date(),
        },
      });
    }

    // 5. Refund reversed.
    if (
      refundStatus === 'reversed'
    ) {
      return this.prisma.payment.update({
        where: {
          id: payment.id,
        },

        data: {
          refundStatus: RefundStatus.REVERSED
        },
      });
    }

    // 6. Still processing / initiated.
    return this.prisma.payment.update({
      where: {
        id: payment.id,
      },

      data: {
        refundStatus: RefundStatus.PROCESSING,
      },
    });
  }
}
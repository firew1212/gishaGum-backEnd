import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { Request } from 'express';

import { UserRole } from '../../generated/prisma/client.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

import { InitializePaymentDto } from './dto/initialize-payment.dto.js';
import { RefundPaymentDto } from './dto/refund-payment.dto.js';
import { PaymentsService } from './payments.service.js';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
  ) {}

  // ==================================================
  // CUSTOMER
  // ==================================================

  @UseGuards(JwtAuthGuard)
  @Post('initialize')
  initializePayment(
    @Req() request: Request,
    @Body() dto: InitializePaymentDto,
  ) {
    const user = request.user as {
      id: string;
    };

    return this.paymentsService.initializePayment(
      user.id,
      dto,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  findMyPayments(
    @Req() request: Request,
  ) {
    const user = request.user as {
      id: string;
    };

    return this.paymentsService.findMyPayments(
      user.id,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('verify/:txRef')
  verifyPayment(
    @Req() request: Request,
    @Param('txRef') txRef: string,
  ) {
    const user = request.user as {
      id: string;
    };

    return this.paymentsService.verifyPayment(
      user.id,
      txRef,
    );
  }

  // ==================================================
  // CHAPA CALLBACK
  // ==================================================

  @Post('chapa/callback')
  chapaCallback(
    @Body() body: unknown,
  ) {
    return this.paymentsService.handleChapaCallback(
      body,
    );
  }

  // ==================================================
  // ADMIN / CASHIER
  // ==================================================

  @UseGuards(
    JwtAuthGuard,
    RolesGuard,
  )
  @Roles(
    UserRole.ADMIN,
    UserRole.CASHIER,
  )
  @Get()
  findAllPayments() {
    return this.paymentsService.findAllPayments();
  }

  @UseGuards(
    JwtAuthGuard,
    RolesGuard,
  )
  @Roles(
    UserRole.ADMIN,
    UserRole.CASHIER,
  )
  @Get(':id/refund/verify')
  verifyRefund(
    @Param('id') paymentId: string,
  ) {
    return this.paymentsService.verifyRefund(
      paymentId,
    );
  }

  @UseGuards(
    JwtAuthGuard,
    RolesGuard,
  )
  @Roles(
    UserRole.ADMIN,
    UserRole.CASHIER,
  )
  @Post(':id/refund')
  refundPayment(
    @Param('id') paymentId: string,
    @Body() dto: RefundPaymentDto,
  ) {
    return this.paymentsService.refundPayment(
      paymentId,
      dto,
    );
  }

  @UseGuards(
    JwtAuthGuard,
    RolesGuard,
  )
  @Roles(
    UserRole.ADMIN,
    UserRole.CASHIER,
  )
  @Get(':id')
  findPaymentById(
    @Param('id') paymentId: string,
  ) {
    return this.paymentsService.findPaymentById(
      paymentId,
    );
  }
}
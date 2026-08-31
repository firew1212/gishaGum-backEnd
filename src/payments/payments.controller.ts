import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { Request } from 'express';

import { UserRole } from '../../generated/prisma/client.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

import { InitializePaymentDto } from './dto/initialize-payment.dto.js';
import { ManualPaymentDto } from './dto/manual-payment.dto.js';
import { PaymentFilterDto } from './dto/payment-filter.dto.js';

import { PaymentsService } from './payments.service.js';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
  ) {}

  // ==================================================
  // CUSTOMER — INITIALIZE ONLINE PAYMENT
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

  // ==================================================
  // CUSTOMER — MY PAYMENTS
  // ==================================================

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

  // ==================================================
  // CUSTOMER — VERIFY CHAPA PAYMENT
  // ==================================================

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
  // CHAPA — CALLBACK
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
  // ADMIN — ALL PAYMENTS
  // ==================================================

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  findAllPayments(
    @Query() filters: PaymentFilterDto,
  ) {
    return this.paymentsService.findAllPayments(
      filters,
    );
  }

  // ==================================================
  // ADMIN — PAYMENT DETAILS
  // ==================================================

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get(':id')
  findPaymentById(
    @Param('id') paymentId: string,
  ) {
    return this.paymentsService.findPaymentById(
      paymentId,
    );
  }

  // ==================================================
  // ADMIN — MANUAL PAYMENT
  // ==================================================

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('manual')
  createManualPayment(
    @Body() dto: ManualPaymentDto,
  ) {
    return this.paymentsService.createManualPayment(
      dto,
    );
  }
}
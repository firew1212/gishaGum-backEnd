import {
  IsEnum,
  IsNumber,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

import {
  PaymentMethod,
  PaymentType,
} from '../../../generated/prisma/client.js';

export class ManualPaymentDto {
  @IsUUID()
  bookingId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsEnum(PaymentType)
  paymentType!: PaymentType;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsString()
  reference!: string;
}
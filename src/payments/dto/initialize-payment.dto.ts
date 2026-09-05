import { IsEnum, IsUUID } from 'class-validator';

import {
  PaymentMethod,
  PaymentType,
} from '../../../generated/prisma/client.js';

export class InitializePaymentDto {
  @IsUUID()
  bookingId!: string;

  @IsEnum(PaymentType)
  paymentType!: PaymentType;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;
}

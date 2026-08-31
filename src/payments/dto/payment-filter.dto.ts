import {
  IsDateString,
  IsEnum,
  IsOptional,
} from 'class-validator';

import {
  PaymentMethod,
  PaymentStatus,
} from '../../../generated/prisma/client.js';

export class PaymentFilterDto {
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
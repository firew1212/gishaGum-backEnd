import {
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

import { NotificationType } from '../../../generated/prisma/client.js';

export class CreateNotificationDto {
  @IsNotEmpty()
  @IsString()
  userId!: string;

  @IsEnum(NotificationType)
  type!: NotificationType;

  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  message!: string;
}
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsUUID } from 'class-validator';

export class CheckAvailabilityDto {
  @Type(() => Date)
  @IsDate()
  checkIn!: Date;

  @Type(() => Date)
  @IsDate()
  checkOut!: Date;

  @IsOptional()
  @IsUUID()
  roomTypeId?: string;
}

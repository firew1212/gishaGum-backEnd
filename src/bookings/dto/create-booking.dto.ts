import {
  IsArray,
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BookingRoomDto {
  @IsUUID()
  roomId!: string;
}

export class BookingGuestDto {
  @IsNotEmpty()
  fullName!: string;

  @IsNotEmpty()
  phone!: string;

  @IsNotEmpty()
  nationalId!: string;

  @IsNotEmpty()
  nationality!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  isPrimary?: boolean;
}

export class CreateBookingDto {
  @IsDateString()
  checkIn!: string;

  @IsDateString()
  checkOut!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookingRoomDto)
  rooms!: BookingRoomDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookingGuestDto)
  guests!: BookingGuestDto[];
}

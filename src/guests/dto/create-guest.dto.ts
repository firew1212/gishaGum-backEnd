import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';

export class CreateGuestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nationalId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nationality!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

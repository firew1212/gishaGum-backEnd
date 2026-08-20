import { IsInt, IsNotEmpty, IsString, IsUUID, Min } from 'class-validator';

export class CreateRoomDto {
  @IsString()
  @IsNotEmpty()
  roomNumber!: string;

  @IsInt()
  @Min(0)
  floor!: number;

  @IsUUID()
  roomTypeId!: string;
}
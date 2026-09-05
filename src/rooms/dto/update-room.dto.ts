import { PartialType } from '@nestjs/mapped-types';
import { CreateRoomDto } from './create-room.dto.js';
import { IsEnum, IsOptional } from 'class-validator';
import { RoomStatus } from '../../../generated/prisma/client.js';

export class UpdateRoomDto extends PartialType(CreateRoomDto) {
  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;
}

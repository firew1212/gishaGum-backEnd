import { PartialType } from '@nestjs/mapped-types';
import { CreateRoomTypeDto } from './create-room-type.dto.js';

export class UpdateRoomTypeDto extends PartialType(CreateRoomTypeDto) {}
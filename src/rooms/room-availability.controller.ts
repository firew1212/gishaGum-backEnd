import { Controller, Get, Query } from '@nestjs/common';

import { CheckAvailabilityDto } from './dto/check-availability.dto.js';
import { RoomsService } from './rooms.service.js';

@Controller('')
export class RoomAvailabilityController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get('availability')
  checkAvailability(@Query() dto: CheckAvailabilityDto) {
    return this.roomsService.checkAvailability(dto);
  }
}

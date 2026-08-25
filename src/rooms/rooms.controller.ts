import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  Query,
} from '@nestjs/common';

import { UserRole } from '../../generated/prisma/client.js';

import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';

import { CreateRoomDto } from './dto/create-room.dto.js';
import { UpdateRoomDto } from './dto/update-room.dto.js';
import { RoomsService } from './rooms.service.js';

import { CheckAvailabilityDto } from './dto/check-availability.dto.js';




@Controller('rooms')

export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateRoomDto) {
    return this.roomsService.createRoom(dto);
  }

  @Get()
  findAll() {
    return this.roomsService.findAllRooms();
  }



  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.roomsService.findRoomById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
 @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.roomsService.updateRoom(id, dto);
  }


@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.roomsService.deleteRoom(id);
  }

  
}
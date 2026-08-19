import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreateRoomTypeDto } from './dto/create-room-type.dto.js';
import { UpdateRoomTypeDto } from './dto/update-room-type.dto.js';
import { CreateRoomDto } from './dto/create-room.dto.js';
import { UpdateRoomDto } from './dto/update-room.dto.js';
import { BadRequestException } from '@nestjs/common';
import { CheckAvailabilityDto } from './dto/check-availability.dto.js';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================
  // ROOM TYPE
  // =========================

  async createRoomType(dto: CreateRoomTypeDto) {
    const existing = await this.prisma.roomType.findUnique({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException('Room type already exists');
    }

    return this.prisma.roomType.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        amenities: dto.amenities,
        images: dto.images,
      },
    });
  }

  async findAllRoomTypes() {
    return this.prisma.roomType.findMany({
      include: {
        rooms: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findRoomTypeById(id: string) {
    const roomType = await this.prisma.roomType.findUnique({
      where: { id },
      include: {
        rooms: true,
      },
    });

    if (!roomType) {
      throw new NotFoundException('Room type not found');
    }

    return roomType;
  }

  async updateRoomType(id: string, dto: UpdateRoomTypeDto) {
    await this.findRoomTypeById(id);

    if (dto.name) {
      const existing = await this.prisma.roomType.findFirst({
        where: {
          name: dto.name,
          NOT: { id },
        },
      });

      if (existing) {
        throw new ConflictException('Room type already exists');
      }
    }

    return this.prisma.roomType.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        amenities: dto.amenities,
        images: dto.images,
      },
    });
  }

  async deleteRoomType(id: string) {
    await this.findRoomTypeById(id);

    const roomCount = await this.prisma.room.count({
      where: { roomTypeId: id },
    });

    if (roomCount > 0) {
      throw new ConflictException(
        'Cannot delete a room type that has rooms assigned to it',
      );
    }

    await this.prisma.roomType.delete({
      where: { id },
    });

    return {
      message: 'Room type deleted successfully',
    };
  }

  // =========================
  // ROOM
  // =========================

  async createRoom(dto: CreateRoomDto) {
    const existingRoom = await this.prisma.room.findUnique({
      where: {
        roomNumber: dto.roomNumber,
      },
    });

    if (existingRoom) {
      throw new ConflictException('Room number already exists');
    }

    const roomType = await this.prisma.roomType.findUnique({
      where: {
        id: dto.roomTypeId,
      },
    });

    if (!roomType) {
      throw new NotFoundException('Room type not found');
    }

    return this.prisma.room.create({
      data: {
        roomNumber: dto.roomNumber,
        floor: dto.floor,
        roomTypeId: dto.roomTypeId,
      },
      include: {
        roomType: true,
      },
    });
  }

  async findAllRooms() {
    return this.prisma.room.findMany({
      include: {
        roomType: true,
      },
      orderBy: {
        roomNumber: 'asc',
      },
    });
  }

  async findRoomById(id: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: {
        roomType: true,
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return room;
  }

  async updateRoom(id: string, dto: UpdateRoomDto) {
    await this.findRoomById(id);

    if (dto.roomNumber) {
      const existingRoom = await this.prisma.room.findFirst({
        where: {
          roomNumber: dto.roomNumber,
          NOT: { id },
        },
      });

      if (existingRoom) {
        throw new ConflictException('Room number already exists');
      }
    }

    if (dto.roomTypeId) {
      const roomType = await this.prisma.roomType.findUnique({
        where: {
          id: dto.roomTypeId,
        },
      });

      if (!roomType) {
        throw new NotFoundException('Room type not found');
      }
    }

    return this.prisma.room.update({
      where: { id },
      data: {
        roomNumber: dto.roomNumber,
        floor: dto.floor,
        roomTypeId: dto.roomTypeId,
        status: dto.status,
      },
      include: {
        roomType: true,
      },
    });
  }

  async deleteRoom(id: string) {
    await this.findRoomById(id);

    const bookingCount = await this.prisma.bookingRoom.count({
      where: {
        roomId: id,
      },
    });

    if (bookingCount > 0) {
      throw new ConflictException(
        'Cannot delete a room with booking history',
      );
    }

    await this.prisma.room.delete({
      where: { id },
    });

    return {
      message: 'Room deleted successfully',
    };
  }


  async checkAvailability(dto: CheckAvailabilityDto) {
  const { checkIn, checkOut, roomTypeId } = dto;

  if (checkOut <= checkIn) {
    throw new BadRequestException(
      'Check-out date must be after check-in date',
    );
  }

  const rooms = await this.prisma.room.findMany({
    where: {
      status: {
        notIn: ['MAINTENANCE', 'OUT_OF_SERVICE'],
      },

      ...(roomTypeId && {
        roomTypeId,
      }),

      bookings: {
        none: {
          isActive: true,

          checkIn: {
            lt: checkOut,
          },

          checkOut: {
            gt: checkIn,
          },
        },
      },
    },

    include: {
      roomType: true,
    },

    orderBy: {
      roomNumber: 'asc',
    },
  });

  return rooms;
}
}
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service.js';

import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  constructor(
  private readonly prisma: PrismaService,
  private readonly jwtService: JwtService,
) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: dto.phone },
          { email: dto.email },
          { nationalId: dto.nationalId },
        ],
      },
    });

    if (existingUser) {
      throw new ConflictException(
        'Phone, email, or national ID is already registered',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email,
        nationalId: dto.nationalId,
        nationality: dto.nationality,
        passwordHash,
        role: 'CUSTOMER',
      },
    });

    return {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      role: user.role,
    };
  }

  async login(dto: LoginDto) {
  const user = await this.prisma.user.findUnique({
    where: {
      phone: dto.phone,
    },
  });

  if (!user || !user.isActive) {
    throw new UnauthorizedException('Invalid phone or password');
  }

  const passwordMatches = await bcrypt.compare(
    dto.password,
    user.passwordHash,
  );

  if (!passwordMatches) {
    throw new UnauthorizedException('Invalid phone or password');
  }

  const payload = {
    sub: user.id,
    phone: user.phone,
    role: user.role,
  };

  const accessToken = await this.jwtService.signAsync(payload);

  return {
    accessToken,
    user: {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      role: user.role,
    },
  };
}
}
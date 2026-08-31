import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';

import { UserRole } from '../../generated/prisma/client.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';

import { ReportsService } from './reports.service.js';

@Controller('reports')
@UseGuards(
  JwtAuthGuard,
  RolesGuard,
)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
  ) {}

  // ==================================================
  // ADMIN / CASHIER — HOTEL DASHBOARD
  // GET /api/reports/dashboard
  // ==================================================

  @Get('dashboard')
  @Roles(
    UserRole.ADMIN,
    UserRole.CASHIER,
  )
  getDashboard() {
    return this.reportsService.getDashboard();
  }
}
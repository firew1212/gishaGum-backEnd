import {
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  // ==================================================
  // CUSTOMER — GET MY NOTIFICATIONS
  // ==================================================

  @Get('my')
  findMyNotifications(
    @Req() request: Request,
  ) {
    const user = request.user as {
      id: string;
    };

    return this.notificationsService.findMyNotifications(
      user.id,
    );
  }

  // ==================================================
  // CUSTOMER — GET MY UNREAD NOTIFICATIONS
  // ==================================================

  @Get('my/unread')
  findMyUnreadNotifications(
    @Req() request: Request,
  ) {
    const user = request.user as {
      id: string;
    };

    return this.notificationsService.findMyUnreadNotifications(
      user.id,
    );
  }

  // ==================================================
  // CUSTOMER — GET UNREAD COUNT
  // ==================================================

  @Get('my/unread/count')
  getUnreadCount(
    @Req() request: Request,
  ) {
    const user = request.user as {
      id: string;
    };

    return this.notificationsService.getUnreadCount(
      user.id,
    );
  }

  // ==================================================
  // CUSTOMER — GET ONE NOTIFICATION
  // ==================================================

  @Get('my/:id')
  findMyNotification(
    @Req() request: Request,
    @Param('id') notificationId: string,
  ) {
    const user = request.user as {
      id: string;
    };

    return this.notificationsService.findMyNotification(
      user.id,
      notificationId,
    );
  }

  // ==================================================
  // CUSTOMER — MARK ONE AS READ
  // ==================================================

  @Patch('my/:id/read')
  markAsRead(
    @Req() request: Request,
    @Param('id') notificationId: string,
  ) {
    const user = request.user as {
      id: string;
    };

    return this.notificationsService.markAsRead(
      user.id,
      notificationId,
    );
  }

  // ==================================================
  // CUSTOMER — MARK ALL AS READ
  // ==================================================

  @Patch('my/read-all')
  markAllAsRead(
    @Req() request: Request,
  ) {
    const user = request.user as {
      id: string;
    };

    return this.notificationsService.markAllAsRead(
      user.id,
    );
  }

  // ==================================================
  // CUSTOMER — DELETE ONE NOTIFICATION
  // ==================================================

  @Patch('my/:id/delete')
  deleteNotification(
    @Req() request: Request,
    @Param('id') notificationId: string,
  ) {
    const user = request.user as {
      id: string;
    };

    return this.notificationsService.deleteNotification(
      user.id,
      notificationId,
    );
  }
}
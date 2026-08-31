import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

import { CreateNotificationDto } from './dto/create-notification.dto.js';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // ==================================================
  // CREATE NOTIFICATION
  // ==================================================

  async createNotification(
    dto: CreateNotificationDto,
  ) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id: dto.userId,
        },

        select: {
          id: true,
        },
      });

    if (!user) {
      throw new NotFoundException(
        'User not found',
      );
    }

    return this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        message: dto.message,
      },
    });
  }

  // ==================================================
  // GET MY NOTIFICATIONS
  // ==================================================

  async findMyNotifications(
    userId: string,
  ) {
    return this.prisma.notification.findMany({
      where: {
        userId,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // ==================================================
  // GET MY UNREAD NOTIFICATIONS
  // ==================================================

  async findMyUnreadNotifications(
    userId: string,
  ) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        isRead: false,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // ==================================================
  // GET UNREAD COUNT
  // ==================================================

  async getUnreadCount(
    userId: string,
  ) {
    const count =
      await this.prisma.notification.count({
        where: {
          userId,
          isRead: false,
        },
      });

    return {
      count,
    };
  }

  // ==================================================
  // GET ONE NOTIFICATION
  // ==================================================

  async findMyNotification(
    userId: string,
    notificationId: string,
  ) {
    const notification =
      await this.prisma.notification.findFirst({
        where: {
          id: notificationId,
          userId,
        },
      });

    if (!notification) {
      throw new NotFoundException(
        'Notification not found',
      );
    }

    return notification;
  }

  // ==================================================
  // MARK ONE AS READ
  // ==================================================

  async markAsRead(
    userId: string,
    notificationId: string,
  ) {
    const notification =
      await this.prisma.notification.findFirst({
        where: {
          id: notificationId,
          userId,
        },
      });

    if (!notification) {
      throw new NotFoundException(
        'Notification not found',
      );
    }

    if (notification.isRead) {
      return {
        success: true,
        message:
          'Notification already marked as read',
        notification,
      };
    }

    const updated =
      await this.prisma.notification.update({
        where: {
          id: notification.id,
        },

        data: {
          isRead: true,
        },
      });

    return {
      success: true,
      message:
        'Notification marked as read',
      notification: updated,
    };
  }

  // ==================================================
  // MARK ALL AS READ
  // ==================================================

  async markAllAsRead(
    userId: string,
  ) {
    const result =
      await this.prisma.notification.updateMany({
        where: {
          userId,
          isRead: false,
        },

        data: {
          isRead: true,
        },
      });

    return {
      success: true,

      message:
        'All notifications marked as read',

      updatedCount:
        result.count,
    };
  }

  // ==================================================
  // DELETE ONE NOTIFICATION
  // ==================================================

  async deleteNotification(
    userId: string,
    notificationId: string,
  ) {
    const notification =
      await this.prisma.notification.findFirst({
        where: {
          id: notificationId,
          userId,
        },
      });

    if (!notification) {
      throw new NotFoundException(
        'Notification not found',
      );
    }

    await this.prisma.notification.delete({
      where: {
        id: notification.id,
      },
    });

    return {
      success: true,

      message:
        'Notification deleted successfully',
    };
  }
}
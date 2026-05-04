import prisma from '@/lib/prisma';
import type { NotificationType } from '@prisma/client';

export interface NotificationInput {
  userId: number;
  type: NotificationType;
  title: string;
  body?: string | null;
}

export const createNotifications = async (items: NotificationInput[]) => {
  if (items.length === 0) return;

  await prisma.notification.createMany({
    data: items.map((item) => ({
      userId: item.userId,
      type: item.type,
      title: item.title,
      body: item.body ?? null,
    })),
  });
};

import { randomUUID } from 'crypto';
import { eq, desc, sql } from 'drizzle-orm';
import { getDb } from './index.js';
import { notifications, subscriptions } from './schema.js';
import { emitEvent } from '../events/bus.js';

/**
 * Create a notification, then distribute to all subscribers.
 */
export async function createNotification(notificationText: string, payload: unknown) {
  const db = getDb();
  const now = Date.now();
  const row = {
    id: randomUUID(),
    notification: notificationText,
    payload: JSON.stringify(payload),
    read: 0,
    createdAt: now,
  };
  db.insert(notifications).values(row).run();
  emitEvent('notification', row);

  // Distribute to subscribers (fire-and-forget)
  distributeNotification(notificationText).catch((err) => {
    console.error('Failed to distribute notification:', err);
  });

  return row;
}

/**
 * Get all notifications, newest first.
 */
export function getNotifications() {
  const db = getDb();
  return db
    .select()
    .from(notifications)
    .orderBy(desc(notifications.createdAt))
    .all();
}

/**
 * Get count of unread notifications.
 */
export function getUnreadCount(): number {
  const db = getDb();
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(eq(notifications.read, 0))
    .get();
  return result?.count ?? 0;
}

/**
 * Mark all notifications as read.
 */
export function markAllRead(): void {
  const db = getDb();
  db.update(notifications)
    .set({ read: 1 })
    .where(eq(notifications.read, 0))
    .run();
}

/**
 * Get all subscriptions.
 */
export function getSubscriptions() {
  const db = getDb();
  return db.select().from(subscriptions).all();
}

/**
 * Distribute a notification to all subscribers.
 */
async function distributeNotification(notificationText: string): Promise<void> {
  const subs = getSubscriptions();
  if (!subs.length) return;

  for (const sub of subs) {
    try {
      if (sub.platform === 'telegram') {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) continue;
        const { sendMessage } = await import('../tools/telegram.js');
        await sendMessage(botToken, sub.channelId, notificationText);
      }
    } catch (err) {
      console.error(`Failed to send to ${sub.platform}/${sub.channelId}:`, err);
    }
  }
}

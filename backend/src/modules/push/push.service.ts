import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PushPayload, SubscribeDto } from './push.dto';

const REQUIRED_VAPID_FIELDS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const;

/**
 * Loaded lazily so that:
 *   - missing `web-push` at install time doesn't crash boot (the warning
 *     in onModuleInit explains the situation), and
 *   - the build-time TypeScript surface stays minimal.
 */
type WebPushLib = typeof import('web-push');

export interface PushStatus {
  /** True when the operator has provided VAPID keys + subject. */
  configured: boolean;
  /** Hint at why pushes are off, for the readiness endpoint. */
  missingFields: string[];
  /** Public key the browser needs to call `pushManager.subscribe()`. */
  publicKey: string | null;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger('PushService');
  private webPush: WebPushLib | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const status = this.getStatus();
    if (!status.configured) {
      this.logger.warn(
        `Web Push delivery is DISABLED (missing env vars: ${status.missingFields.join(', ')}). ` +
          `Run "npx web-push generate-vapid-keys" and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT.`,
      );
      return;
    }
    try {
      const wp: WebPushLib = await import('web-push');
      wp.setVapidDetails(
        process.env.VAPID_SUBJECT!,
        process.env.VAPID_PUBLIC_KEY!,
        process.env.VAPID_PRIVATE_KEY!,
      );
      this.webPush = wp;
      this.logger.log('Web Push delivery is enabled.');
    } catch (err) {
      // Library missing or VAPID keys malformed — treat as disabled, not fatal.
      this.logger.warn(
        `Web Push library failed to initialise (${err instanceof Error ? err.message : String(err)}); ` +
          `notifications are disabled.`,
      );
      this.webPush = null;
    }
  }

  getStatus(): PushStatus {
    const missingFields = REQUIRED_VAPID_FIELDS.filter((k) => !process.env[k]);
    return {
      configured: missingFields.length === 0,
      missingFields,
      publicKey: process.env.VAPID_PUBLIC_KEY ?? null,
    };
  }

  /**
   * Idempotent register/refresh of a browser subscription. Re-subscribing
   * from the same device just refreshes the user/tenant binding and
   * resets the failure counter.
   */
  async subscribe(
    userId: string,
    tenantId: string | null,
    dto: SubscribeDto,
    userAgent?: string | null,
  ) {
    if (!this.getStatus().configured) {
      throw new ServiceUnavailableException({
        message: 'Push notifications are not configured on the server.',
        errorCode: 'push_unconfigured',
        missingFields: this.getStatus().missingFields,
      });
    }
    if (!dto?.endpoint || !dto?.keys?.p256dh || !dto?.keys?.auth) {
      throw new ServiceUnavailableException('Invalid Web Push subscription payload.');
    }
    const endpoint = dto.endpoint;
    const endpointHash = sha256(endpoint);
    const ua = userAgent ? userAgent.slice(0, 255) : null;
    return this.prisma.pushSubscription.upsert({
      where: { endpointHash },
      create: {
        id: randomUUID(),
        userId,
        tenantId,
        endpoint,
        endpointHash,
        p256dh: dto.keys.p256dh.slice(0, 255),
        authKey: dto.keys.auth.slice(0, 255),
        userAgent: ua,
      },
      update: {
        userId,
        tenantId,
        userAgent: ua,
        consecutiveFailures: 0,
        failureReason: null,
      },
    });
  }

  async unsubscribe(userId: string, endpoint: string): Promise<{ removed: number }> {
    if (!endpoint) return { removed: 0 };
    const endpointHash = sha256(endpoint);
    const result = await this.prisma.pushSubscription.deleteMany({
      where: { endpointHash, userId },
    });
    return { removed: result.count };
  }

  /**
   * Fans out a push payload to every subscription registered for `userId`.
   * Failed sends with 404/410 (browser unsubscribed) prune the row;
   * other failures bump the counter so we can debug without losing rows.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<{ sent: number; total: number }> {
    if (!this.webPush) return { sent: 0, total: 0 };
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return { sent: 0, total: 0 };

    const data = JSON.stringify(payload);
    let sent = 0;
    for (const sub of subs) {
      try {
        await this.webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.authKey },
          },
          data,
        );
        sent += 1;
        await this.prisma.pushSubscription
          .update({
            where: { id: sub.id },
            data: { lastSuccessAt: new Date(), consecutiveFailures: 0, failureReason: null },
          })
          .catch(() => undefined);
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode ?? 0;
        if (status === 404 || status === 410) {
          await this.prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => undefined);
          continue;
        }
        const message = err instanceof Error ? err.message : String(err);
        await this.prisma.pushSubscription
          .update({
            where: { id: sub.id },
            data: {
              lastFailureAt: new Date(),
              failureReason: message.slice(0, 255),
              consecutiveFailures: { increment: 1 },
            },
          })
          .catch(() => undefined);
      }
    }
    return { sent, total: subs.length };
  }

  /**
   * Sends a self-test notification to the current user. The frontend uses
   * this to verify that subscribing actually wires through to the browser.
   */
  sendTest(userId: string) {
    return this.sendToUser(userId, {
      title: 'مواصلات مصر',
      body: 'تم تفعيل التنبيهات على هذا الجهاز ✅',
      url: '/',
      tag: 'mwasalat-test',
    });
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

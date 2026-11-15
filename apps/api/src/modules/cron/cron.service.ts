import * as cron from 'node-cron';
import { productRepository } from '../product/product.repository';
import { purge } from '../product/product.service';
import { paymentRepository } from '../payment/payment.repository';
import { autoCancelStaleUnpaidOnlineOrders } from '../order/order.service';
import { scanInventoryViaAgentService } from '../agent/agent.client';

// Inventory scan is now owned by apps/agent worker only.
// This function is kept for manual/startup triggers via RUN_CRON_ON_START.
export const runInventoryScan = async () => {
  console.log('Running inventory scan (manual trigger from API)...');
  try {
    await scanInventoryViaAgentService({ triggerType: "SCHEDULED_CRON_SCAN" });
    console.log('Inventory scan completed.');
  } catch (error: any) {
    console.error(`Inventory scan failed: ${error.message}`);
  }
};

export const runProductPurge = async () => {
  try {
    const productsToPurge = await productRepository.findExpiredPendingDeleteProducts(new Date());

    let purgedCount = 0;
    let blockedCount = 0;
    let failedCount = 0;
    const blockedIds: string[] = [];

    for (const product of productsToPurge) {
      try {
        await purge(product.id);
        purgedCount++;
      } catch (error: any) {
        if (error.statusCode === 409 || error.status === 409 || error.message?.includes('đã phát sinh')) {
          blockedCount++;
          blockedIds.push(product.id);
        } else {
          failedCount++;
        }
      }
    }

    console.log(`Product purge cron summary:
- Expired pending delete: ${productsToPurge.length}
- Purged: ${purgedCount}
- Blocked by related data: ${blockedCount}
- Failed by unexpected error: ${failedCount}`);

    if (blockedIds.length > 0) {
      console.log(`Blocked product ids: ${blockedIds.join(', ')}`);
    }
  } catch (error: any) {
    console.error(`Product purge cron failed unexpectedly: ${error.message}`);
  }
};

export const runPaymentExpiration = async (): Promise<number> => {
  try {
    const now = new Date();
    const expiredCount = await paymentRepository.expireStaleOnlinePayments(now);
    if (expiredCount > 0) {
      console.log(`[PAYMENT][CRON] Expired ${expiredCount} stale online payment attempt(s).`);
    }

    if (process.env.ENABLE_UNPAID_ORDER_AUTO_CANCEL !== 'false') {
      const { cancelledCount, failedCount, cancelledOrderIds } = await autoCancelStaleUnpaidOnlineOrders(now);
      if (cancelledCount > 0 || failedCount > 0) {
        console.log(
          `[PAYMENT][CRON] Auto-cancelled ${cancelledCount} stale unpaid online order(s) and released reserved stock` +
            (failedCount > 0 ? ` (failed: ${failedCount})` : '') +
            (cancelledOrderIds.length > 0 ? `: ${cancelledOrderIds.join(', ')}` : '')
        );
      }
    }

    return expiredCount;
  } catch (error: any) {
    console.error(`[PAYMENT][CRON] Payment expiration job failed: ${error.message}`);
    return 0;
  }
};

export const scheduleProductPurgeCron = () => {
  const enabled = process.env.ENABLE_PRODUCT_PURGE_CRON !== 'false';
  const schedule = process.env.PRODUCT_PURGE_CRON_SCHEDULE || '0 0 * * *';

  if (enabled) {
    cron.schedule(schedule, runProductPurge);
    console.log(`Scheduled product purge cron: ${schedule}`);
  }
};

export const schedulePaymentExpirationCron = () => {
  const enabled = process.env.ENABLE_PAYMENT_EXPIRE_CRON !== 'false';
  const schedule = process.env.PAYMENT_EXPIRE_CRON_SCHEDULE || '*/5 * * * *';

  if (enabled) {
    cron.schedule(schedule, () => {
      void runPaymentExpiration();
    });
    console.log(`Scheduled payment expiration cron: ${schedule}`);
  }
};

export const scheduleJobs = async () => {
  // Inventory scan cron is now handled exclusively by apps/agent worker.
  // API schedules product purge cron and online payment expiration cron.
  scheduleProductPurgeCron();
  schedulePaymentExpirationCron();

  if (process.env.RUN_CRON_ON_START === 'true') {
    console.log('RUN_CRON_ON_START=true, executing crons immediately...');
    runProductPurge();
    runPaymentExpiration();
    runInventoryScan();
  }
};

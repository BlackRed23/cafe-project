import cron from 'node-cron';
import { productRepository } from '../product/product.repository';
import { purge } from '../product/product.service';

const purgeExpiredProducts = async () => {
  console.log('Running cron job to purge expired products...');
  const productsToPurge = await productRepository.findExpiredPendingDeleteProducts(new Date());

  if (productsToPurge.length === 0) {
    console.log('No expired products to purge.');
    return;
  }

  console.log(`Found ${productsToPurge.length} products to purge.`);

  for (const product of productsToPurge) {
    try {
      await purge(product.id);
      console.log(`Successfully purged product with id: ${product.id}`);
    } catch (error: any) {
      console.error(`Failed to purge product with id: ${product.id}. Reason: ${error.message}`);
    }
  }
};

export const scheduleJobs = () => {
  // Schedule to run once a day at midnight
  cron.schedule('0 0 * * *', purgeExpiredProducts);
  console.log('Scheduled job to purge expired products daily at midnight.');
};

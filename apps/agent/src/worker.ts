import dotenv from 'dotenv';
import path from 'path';

// Load environmental config
dotenv.config();

import { env } from './config/env';
import { prisma } from '@cafe-project/database';
import { logger } from './utils/logger';
import { initInventoryScanJob } from './jobs/inventory-scan.job';
import { agentService } from './services/agent.service';

const main = async () => {
    logger.info('AI Agent starting...');

    // 1. Connect Prisma
    try {
        await prisma.$connect();
        logger.info('Connected to database successfully.');
    } catch (err) {
        logger.error('❌ Failed to connect to database:', err);
        process.exit(1);
    }

    // 2. Print required startup log exactly
    console.log('AI Agent started');

    // 3. Check for manual run through startup flag or argv
    const scanOnce = process.argv.includes('--scan-once') || env.RUN_ON_START;

    if (scanOnce) {
        logger.info('Immediate scan requested.');
        try {
            await agentService.runScan('MANUAL');
        } catch (err) {
            logger.error('Error running manual scan:', err);
        }

        // If manual command support requested scan-once, exit immediately
        if (process.argv.includes('--scan-once')) {
            logger.info('Manual run completed. Exiting.');
            try {
                await prisma.$disconnect();
            } catch (disError) {
                logger.error('Error disconnecting Prisma:', disError);
            }
            process.exit(0);
        }
    }

    // 4. Start scheduled cron jobs
    await initInventoryScanJob();
};

main().catch((err) => {
    logger.error('Fatal crash on AI Agent startup:', err);
    process.exit(1);
});
export {};

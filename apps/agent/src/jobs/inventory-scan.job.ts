import cron from 'node-cron';
import { agentService } from '../services/agent.service';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export const initInventoryScanJob = () => {
    const cronExpression = env.AGENT_SCAN_CRON || '*/10 * * * *';

    logger.info(`Registering inventory scan cron job with expression: ${cronExpression}`);

    cron.schedule(cronExpression, async () => {
        logger.info('Scheduled inventory scan triggered.');
        try {
            await agentService.runScan('SCHEDULED');
        } catch (err) {
            logger.error('Error running scheduled inventory scan:', err);
        }
    });
};

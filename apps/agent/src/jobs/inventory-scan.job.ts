import cron from 'node-cron';
import { agentService } from '../services/agent.service';
import { logger } from '../utils/logger';
import { agentRepository } from '../repositories/agent.repository';

export const initInventoryScanJob = async () => {
    const enabled = await agentRepository.getSettingValue('ai.enabled');
    if (enabled === 'false') {
        logger.info('AI Agent is disabled via setting. Skipping inventory scan cron schedule.');
        return;
    }

    let cronExpression = await agentRepository.getSettingValue('ai.scanCron');

    if (!cronExpression || !cron.validate(cronExpression) || cronExpression.trim().split(/\s+/).length !== 5) {
        logger.warn(`Invalid ai.scanCron setting, fallback to default: 5 0 * * *`);
        cronExpression = '5 0 * * *';
    }

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

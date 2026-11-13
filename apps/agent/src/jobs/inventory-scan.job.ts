
import cron from 'node-cron';
import { agentService } from '../services/agent.service';
import { logger } from '../utils/logger';
import { agentRepository } from '../repositories/agent.repository';
import { env } from '../config/env';

const DEFAULT_SCAN_CRON = '*/10 * * * *';

const isValidScanCron = (value: string | null | undefined): value is string => {
    if (!value) return false;

    const expression = value.trim();

    return (
        expression.split(/\s+/).length === 5 &&
        cron.validate(expression)
    );
};

let scheduledTask: ReturnType<typeof cron.schedule> | null = null;
let scanRunning = false;

export const initInventoryScanJob = async () => {
    const enabled = await agentRepository.getSettingValue('ai.enabled');

    if (enabled === 'false') {
        if (scheduledTask) {
            scheduledTask.stop();
            scheduledTask = null;
        }

        logger.info(
            'AI Agent is disabled via setting. Skipping inventory scan cron schedule.'
        );
        return;
    }

    const databaseCron =
        await agentRepository.getSettingValue('ai.scanCron');

    let cronExpression: string;

    if (isValidScanCron(databaseCron)) {
        cronExpression = databaseCron.trim();
        logger.info('Using inventory scan cron from database.');
    } else if (isValidScanCron(env.AGENT_SCAN_CRON)) {
        cronExpression = env.AGENT_SCAN_CRON.trim();
        logger.warn(
            'Invalid or missing ai.scanCron setting. Using AGENT_SCAN_CRON.'
        );
    } else {
        cronExpression = DEFAULT_SCAN_CRON;
        logger.warn(
            'Invalid inventory scan cron configuration. Using default.'
        );
    }

    if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask = null;
    }

    logger.info(
        `Registering inventory scan cron job with expression: ${cronExpression}`
    );

    scheduledTask = cron.schedule(cronExpression, async () => {
        if (scanRunning) {
            logger.warn(
                'Previous inventory scan still running. Skipping overlapping execution.'
            );
            return;
        }

        scanRunning = true;

        logger.info('Scheduled inventory scan triggered.');

        try {
            await agentService.runScan('SCHEDULED');
        } catch (err) {
            logger.error('Error running scheduled inventory scan:', err);
        } finally {
            scanRunning = false;
        }
    });
};

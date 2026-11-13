import dotenv from 'dotenv';

let startup: Promise<{ stop: () => Promise<void>; completed: boolean }> | undefined;

export const startWorker = () => {
    if (startup) return startup;
    startup = (async () => {
        dotenv.config();
        // Runtime dependencies load only when explicitly starting the worker.
        const { env } = await import('./config/env');
        const { prisma } = await import('@cafe-project/database');
        const { logger } = await import('./utils/logger');
        const { initInventoryScanJob } = await import('./jobs/inventory-scan.job');
        const { agentService } = await import('./services/agent.service');
        const { default: cron } = await import('node-cron');
        const existingTasks = new Set(cron.getTasks().keys());
        const findOwnedTasks = () => [...cron.getTasks()].filter(([id]) => !existingTasks.has(id)).map(([, task]) => task);
        let tasks: ReturnType<typeof findOwnedTasks> = [];
        let stopping: Promise<void> | undefined;
        const stop = () => stopping ??= (async () => {
            process.removeListener('SIGINT', shutdown);
            process.removeListener('SIGTERM', shutdown);
            try {
                for (const task of tasks) await task.destroy();
            } finally {
                await prisma.$disconnect();
            }
        })();
        const shutdown = () => { void stop().catch(error => {
            logger.error('Error shutting down AI Agent:', error);
            process.exitCode = 1;
        }); };
        try {
            logger.info('AI Agent starting...');
            await prisma.$connect();
            logger.info('Connected to database successfully.');
            console.log('AI Agent started');
            const completed = process.argv.includes('--scan-once');
            if (completed || env.RUN_ON_START) {
                logger.info('Immediate scan requested.');
                await agentService.runScan('MANUAL');
            }
            if (completed) {
                logger.info('Manual run completed. Exiting.');
                await stop();
            } else {
                try { await initInventoryScanJob(); } finally { tasks = findOwnedTasks(); }
                process.once('SIGINT', shutdown);
                process.once('SIGTERM', shutdown);
            }
            return { stop, completed };
        } catch (error) {
            try { await stop(); } catch (cleanupError) {
                logger.error('Error cleaning up failed AI Agent startup:', cleanupError);
            }
            throw error;
        }
    })();
    return startup;
};

if (require.main === module) {
    startWorker().catch(error => {
        console.error('Fatal crash on AI Agent startup:', error);
        process.exitCode = 1;
    });
}

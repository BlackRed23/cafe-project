import { startServer } from './server';
import { startWorker } from './worker';

let startup: Promise<void> | undefined;

export const startAgent = () => {
    if (startup) return startup;
    startup = (async () => {
        const server = await startServer();
        try {
            const worker = await startWorker();
            if (worker.completed) await server.stop();
        } catch (error) {
            try { await server.stop(); } catch (cleanupError) {
                console.error('[agent-service] startup cleanup failed:', cleanupError);
            }
            throw error;
        }
    })();
    return startup;
};

if (require.main === module) {
    startAgent().catch(error => {
        console.error('Fatal crash on combined AI Agent startup:', error);
        process.exitCode = 1;
    });
}

/**
 * Retry only PostgreSQL errors that abort the entire transaction.
 * Never retry connection loss, timeouts or other ambiguous commit outcomes:
 * callers must reconcile those using their durable idempotency receipt.
 */
const abortedTransaction = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false;
    const code = (error as { code?: unknown }).code;
    if (code === 'P2034' || code === '40P01' || code === '40001') return true;
    if (code !== 'P2010') return false;
    const meta = (error as { meta?: { code?: unknown } }).meta;
    return meta?.code === '40P01' || meta?.code === '40001';
};

const defaultSleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Three attempts total, with a bounded 50/100 ms backoff. */
export async function retryAbortedPgTransaction<T>(
    operation: () => Promise<T>,
    sleep: (milliseconds: number) => Promise<void> = defaultSleep
): Promise<T> {
    for (let attempt = 0; attempt < 3; ++attempt) {
        try {
            return await operation();
        } catch (error) {
            if (attempt === 2 || !abortedTransaction(error)) throw error;
            await sleep(50 * 2 ** attempt);
        }
    }
    throw new Error('UNREACHABLE_TRANSACTION_RETRY');
}

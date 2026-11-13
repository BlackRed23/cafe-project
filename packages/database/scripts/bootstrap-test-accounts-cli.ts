import { PrismaClient } from '@prisma/client';
import { createInterface, emitKeypressEvents } from 'node:readline';
import { accounts, bootstrap, BootstrapError, validatePassword, validateUrl } from './bootstrap-test-accounts';

// Carry a CR terminator across prompts so its optional LF cannot submit the
// following prompt, including when readline and raw input exchange ownership.
const pendingLf = new WeakMap<NodeJS.ReadStream, boolean>();

export function hiddenInput(label: string): Promise<string> {
    const input = process.stdin;
    if (!input.isTTY || !process.stdout.isTTY || input.isRaw) throw new BootstrapError('TERMINAL_REQUIRED');
    if (input.readableEnded || input.destroyed) throw new BootstrapError('INPUT_INTERRUPTED');
    return new Promise((resolve, reject) => {
        let value = '';
        const wasPaused = input.isPaused();
        const cleanup = () => {
            input.off('keypress', onKey);
            input.off('end', onEnd);
            input.off('close', onEnd);
            input.off('error', onEnd);
            input.setRawMode(false);
            if (wasPaused) input.pause();
            process.stdout.write('\n');
        };
        const onEnd = () => { value = ''; cleanup(); reject(new BootstrapError('INPUT_INTERRUPTED')); };
        const onKey = (text: string | undefined, key: { name?: string; ctrl?: boolean; meta?: boolean; sequence?: string }) => {
            const sequence = key.sequence ?? text;
            const skipLf = pendingLf.get(input) && sequence === '\n';
            pendingLf.set(input, sequence === '\r');
            if (skipLf) return;
            if (key.ctrl && key.name === 'c') return onEnd();
            if (key.name === 'return' || key.name === 'enter') { cleanup(); resolve(value); value = ''; return; }
            if (key.name === 'backspace') { value = Array.from(value).slice(0, -1).join(''); return; }
            if (!key.ctrl && !key.meta && text && !/[\x00-\x1f\x7f]/.test(text) && Buffer.byteLength(value + text) <= 1024) value += text;
        };
        process.stdout.write(label);
        emitKeypressEvents(input);
        input.on('keypress', onKey);
        input.once('end', onEnd);
        input.once('close', onEnd);
        input.once('error', onEnd);
        input.setRawMode(true);
        input.resume();
    });
}

export async function readAccounts() {
    const input = process.stdin;
    const rememberReturn = (text: string | undefined, key: { sequence?: string }) => {
        pendingLf.set(input, (key.sequence ?? text) === '\r');
    };
    const rl = createInterface({ input, output: process.stdout, crlfDelay: Infinity });
    input.on('keypress', rememberReturn);
    const question = (label: string) => new Promise<string>((resolve, reject) => {
        const onClose = () => reject(new BootstrapError('INPUT_INTERRUPTED'));
        rl.once('close', onClose);
        rl.question(label, value => { rl.off('close', onClose); resolve(value); });
    });
    try { return accounts(await question('ADMIN email: '), await question('STAFF email: ')); }
    finally { input.off('keypress', rememberReturn); rl.close(); }
}

export async function confirmedPassword(role: string): Promise<string> {
    const password = await hiddenInput(`${role} password (hidden): `);
    const confirmation = await hiddenInput(`${role} confirm (hidden): `);
    if (password !== confirmation) throw new BootstrapError('PASSWORD_MISMATCH');
    validatePassword(password);
    return password;
}

export function classifyError(error: unknown): { code: string; message: string } {
    if (error instanceof BootstrapError) return { code: error.code, message: error.safeMessage };
    const failure = error as { code?: unknown; message?: unknown; info?: { code?: unknown; message?: unknown } } | null;
    if (failure?.code === 'ENOMEM' || (failure?.code === 'ERR_SYSTEM_ERROR' &&
        (failure.info?.code === 'ENOMEM' || String(failure.info?.message).includes('not enough memory')))) {
        return { code: 'ENVIRONMENT_ENOMEM', message: 'Node runtime failed with ENOMEM; stop and check runtime environment.' };
    }
    const codes: Record<string, string> = {
        P1000: 'DATABASE_AUTH_FAILED', P1001: 'DATABASE_UNREACHABLE', P1003: 'DATABASE_NOT_FOUND',
        P1010: 'DATABASE_PERMISSION_DENIED', P2021: 'DATABASE_SCHEMA_UNAVAILABLE',
        P2002: 'ACCOUNT_CONFLICT', P2034: 'TRANSACTION_RETRY_REQUIRED',
    };
    const code = typeof failure?.code === 'string' && Object.prototype.hasOwnProperty.call(codes, failure.code) ? codes[failure.code]! : 'UNEXPECTED_FAILURE';
    return { code, message: 'Bootstrap stopped. No error details or credentials logged.' };
}

export async function main(): Promise<void> {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && !['--apply', '--dry-run'].includes(args[0]!))) {
        throw new BootstrapError('USAGE_INVALID');
    }
    const url = validateUrl(process.env.DATABASE_URL);
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new BootstrapError('TERMINAL_REQUIRED');
    const targets = await readAccounts();
    // No dotenv, seed import, query logging or error object output.
    const prisma = new PrismaClient({ datasources: { db: { url } }, log: [], errorFormat: 'minimal' });
    try {
        const result = await bootstrap(prisma, targets, args[0] === '--apply', confirmedPassword);
        console.log(JSON.stringify(result));
    } finally { await prisma.$disconnect(); }
}

if (require.main === module) main().catch(error => {
    // Prisma errors can contain URLs, SQL values or credentials; never print them.
    console.error(JSON.stringify(classifyError(error)));
    process.exitCode = 1;
});

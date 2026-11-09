import { createMockHttpApp } from './http';
import jwt from 'jsonwebtoken';

/** No dotenv file, Prisma, legacy routes, scheduler or external provider is loaded here. */
async function main() {
    const instant = process.env.MOCK_NOW;
    if (instant && !Number.isFinite(Date.parse(instant))) throw new Error('Invalid MOCK_NOW');
    const runtime = createMockHttpApp({ env: process.env, clock: instant ? () => new Date(instant) : undefined });
    const tokenIndex = process.argv.indexOf('--token');
    if (tokenIndex !== -1) {
        const principal = await runtime.business.authorize(process.argv[tokenIndex + 1] ?? '', 'inventory.read');
        if (!['ADMIN', 'STAFF'].includes(principal.role)) throw new Error('Invalid mock identity');
        console.log(jwt.sign({ id: principal.id, email: `${principal.id}@mock.invalid`, role: principal.role }, process.env.JWT_SECRET!, { expiresIn: '30m' })); return;
    }
    if (process.argv.includes('--scan-once')) {
        const execution = await runtime.agent.plan('staff', 'recommend', 1);
        const result = await runtime.agent.execute(execution.id, 'staff');
        console.log(JSON.stringify({ status: result.status, provider: 'mock', postgres: 'POSTGRES_NOT_VERIFIED' })); return;
    }
    const port = Number(process.env.MOCK_PORT ?? '5100');
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid MOCK_PORT');
    runtime.app.listen(port, '127.0.0.1', () => console.log(`Mock API listening on 127.0.0.1:${port}`)).on('error', () => { console.error('Mock API startup failed'); process.exitCode = 1; });
}
void main().catch(() => { console.error('Mock API startup rejected: check explicit mock mode, non-production environment and JWT_SECRET'); process.exitCode = 1; });

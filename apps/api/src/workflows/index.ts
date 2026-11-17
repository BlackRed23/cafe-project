import { BusinessWorkflows } from './business-service';
import { createWorkflowRepository } from './provider';
import { bindMockTools } from './tool-mock-services';

/** Composition entry for mock-first service callers; deliberately independent of legacy Prisma HTTP routes. */
export function createBackendWorkflows(env: Record<string, string | undefined> = process.env, clock?: () => Date) {
    return bindMockTools(new BusinessWorkflows(createWorkflowRepository(env), clock));
}
export * from './contracts';
export * from './business-service';
export * from './provider';
export * from './mock-repository';

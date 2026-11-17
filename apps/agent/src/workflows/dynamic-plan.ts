import { TOOL_CONTRACTS, type P1ToolName } from './tool-contracts';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export type ToolChoicePolicy = 'REQUIRES_TOOL' | 'OPTIONAL_TOOL';

export type DynamicToolName = Exclude<
    P1ToolName,
    'createDraftPurchaseRequest'
>;

export type DynamicPlanStep = {
    id: string;
    tool: DynamicToolName;
    input: unknown;
    dependsOn: string[];
};

export type DynamicToolPlan = {
    goal: string;
    steps: DynamicPlanStep[];
};

export function validateDynamicPlan(
    plan: DynamicToolPlan
): void {
    if (
        !record(plan) ||
        Object.keys(plan).sort().join(',') !== 'goal,steps' ||
        typeof plan.goal !== 'string' ||
        !plan.goal.trim() ||
        !Array.isArray(plan.steps) ||
        plan.steps.length === 0 ||
        plan.steps.length > 10
    ) {
        throw Object.assign(new Error('INVALID_DYNAMIC_PLAN'), { reason: 'ROOT_SCHEMA' });
    }

    const completed = new Set<string>();

    for (const step of plan.steps) {
        if (
            !record(step) ||
            Object.keys(step).sort().join(',') !== 'dependsOn,id,input,tool' ||
            typeof step.id !== 'string' ||
            !/^[A-Za-z0-9_-]{1,64}$/.test(step.id) ||
            completed.has(step.id) ||
            typeof step.tool !== 'string' ||
            !Object.prototype.hasOwnProperty.call(TOOL_CONTRACTS, step.tool) ||
            !Array.isArray(step.dependsOn) ||
            step.dependsOn.some(
                dependency =>
                    typeof dependency !== 'string' ||
                    !completed.has(dependency)
            )
        ) {
            throw Object.assign(new Error('INVALID_DYNAMIC_PLAN'), { reason: 'STEP_OR_DEPENDENCY' });
        }

        const contract =
            TOOL_CONTRACTS[step.tool as DynamicToolName];

        if (
            contract.status !== 'IMPLEMENTED' ||
            !contract.input.safeParse(step.input).success
        ) {
            throw Object.assign(new Error('INVALID_DYNAMIC_PLAN'), { reason: 'TOOL_OR_INPUT' });
        }

        completed.add(step.id);
    }
}


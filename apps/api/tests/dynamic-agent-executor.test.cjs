
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

const oldTs = Module._extensions['.ts'];

Module._extensions['.ts'] = (mod, file) => {
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  });

  mod._compile(compiled.outputText, file);
};

after(() => {
  if (oldTs) Module._extensions['.ts'] = oldTs;
  else delete Module._extensions['.ts'];
});

const {
  AgentWorkflow,
  MockAgentRepository,
  createToolRegistry
} = require('../../agent/src/workflows/agent-workflow.ts');

test('Dynamic Executor executes validated tools in order', async () => {
  const called = [];

  const services = {
    authorize: async () => ({ role: 'ADMIN' }),
    availability: async (id) => {
      called.push(id);
      return {
        ingredientId: id,
        baseUnit: 'g',
        quantity: 100,
        reserved: 20,
        available: 80,
        active: true,
        rowVersion: 1
      };
    }
  };

  const business = {
    authorize: services.authorize,
    toolRegistry: createToolRegistry(services, 'MOCK')
  };

  const agent = new AgentWorkflow(
    new MockAgentRepository(),
    business,
    { plan: async () => [] }
  );

  const result = await agent.executeDynamicTools('admin', {
    goal: 'Check ingredient stock',
    steps: [{
      id: 'stock',
      tool: 'getIngredientAvailability',
      input: { ingredientId: 'beans' },
      dependsOn: []
    }]
  });

  assert.equal(result.status, 'SUCCEEDED');
  assert.deepEqual(called, ['beans']);
  assert.equal(result.results.stock.available, 80);
});

test('Dynamic Planner rejects WRITE tools', async () => {
  const business = {
    authorize: async () => ({ role: 'ADMIN' }),
    toolRegistry: createToolRegistry({
      authorize: async () => ({ role: 'ADMIN' })
    }, 'MOCK')
  };

  const agent = new AgentWorkflow(
    new MockAgentRepository(),
    business,
    { plan: async () => [] }
  );

  await assert.rejects(
    agent.planDynamicTools('admin', {
      goal: 'Create purchase',
      steps: [{
        id: 'write',
        tool: 'createDraftPurchaseRequest',
        input: {},
        dependsOn: []
      }]
    }),
    /INVALID_DYNAMIC_PLAN/
  );
});
test('Dynamic Planner generates and executes a tool plan', async () => {
  const selectedTools = [];

  const services = {
    authorize: async () => ({ role: 'ADMIN' }),
    availability: async (id) => ({
      ingredientId: id,
      baseUnit: 'g',
      quantity: 100,
      reserved: 20,
      available: 80,
      active: true,
      rowVersion: 1
    })
  };

  const business = {
    authorize: services.authorize,
    toolRegistry: createToolRegistry(services, 'MOCK')
  };

  const llm = {
    plan: async () => [],
    planDynamic: async (prompt, tools) => {
      selectedTools.push(...tools.map(t => t.name));

      return {
        goal: prompt,
        steps: [{
          id: 'check_stock',
          tool: 'getIngredientAvailability',
          input: { ingredientId: 'beans' },
          dependsOn: []
        }]
      };
    }
  };

  const agent = new AgentWorkflow(
    new MockAgentRepository(),
    business,
    llm
  );

  const plan = await agent.generateDynamicPlan(
    'admin',
    'Kiểm tra tồn kho nguyên liệu beans'
  );

  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0].tool, 'getIngredientAvailability');
  assert.ok(selectedTools.includes('getIngredientAvailability'));
  assert.ok(!selectedTools.includes('createDraftPurchaseRequest'));

  const result = await agent.executeDynamicTools('admin', plan);

  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(result.results.check_stock.available, 80);
});
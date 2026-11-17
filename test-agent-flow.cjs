require('dotenv').config({
    path: require('node:path').resolve(
        __dirname,
        'apps/agent/.env'
    ),
    override: false
});
const {
  createAgentRuntime,
  createToolRegistry
} = require('./apps/agent/dist/workflows/agent-workflow.js');

async function main() {
  const authorize = async (actorId, permission) => {
    if (actorId !== 'admin' ||
        !['agent.run', 'inventory.read'].includes(permission)) {
      throw new Error('FORBIDDEN');
    }
    return { role: 'ADMIN' };
  };

  let toolCalls = 0;

  // Mock Backend, không truy cập PostgreSQL
  const services = {
    authorize,
    availability: async (ingredientId) => {
      toolCalls++;
      if (ingredientId !== 'beans') throw new Error('UNEXPECTED_INGREDIENT_ID');
      return {
        ingredientId,
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
    authorize,
    toolRegistry: createToolRegistry(services, 'MOCK')
  };
    const agent = createAgentRuntime(
        business,
        {
            ...process.env,
            DATA_PROVIDER: 'mock'
        }
    );

  console.log('1. OpenAI dang lap ke hoach...');

    const plan = await agent.generateDynamicPlan(
        'admin',
        'Kiểm tra tồn kho nguyên liệu beans.'
    );

  console.log('2. Ke hoach:', JSON.stringify(plan, null, 2));

  console.log('3. Thuc thi Tool...');

  const result = await agent.executeDynamicTools('admin', plan);

  console.log('4. Ket qua:', JSON.stringify(result, null, 2));

  console.log('5. Tool calls:', toolCalls);

  if (result.status !== 'SUCCEEDED' || toolCalls !== 1) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error('FLOW FAILED:', error.message);
  if (Array.isArray(error.diagnostics)) console.error('SAFE DIAGNOSTICS:', JSON.stringify(error.diagnostics));
  process.exitCode = 1;
});

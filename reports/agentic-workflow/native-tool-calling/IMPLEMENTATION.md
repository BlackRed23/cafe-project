# Native READ tool calling

Native entry: `createReadOnlyAgentRuntime({ authorize, toolRegistry }, config)` in
`apps/agent/src/workflows/agent-workflow.ts`. Bind existing Backend services using
`createToolRegistry(createBackendToolServices(), 'BACKEND')`. Runtime requires Backend
bindings, authorizes `agent.run` and tool permission, and disables legacy persistence.
Existing OpenAI-compatible runtime aliases also select native planner. Legacy JSON
planner remains available for existing unit coverage; native path never falls back to it.

`generateNativeToolPlan` sends READ schemas from `TOOL_CONTRACTS` in `tools`, requires
native calls, validates provider arguments using Zod, then returns steps to existing
AgentWorkflow executor. One HTTP request; no repair retry, model change or tool execution
inside provider. Missing calls raise `LLM_NATIVE_TOOL_CALLS_MISSING`.

Real stock path: Registry -> `createBackendToolServices().availability` ->
`ingredientService.getById` -> existing ingredient repository -> shared Prisma Client.
Authorization reloads current active account through `getCurrentUser`.
No inventory calculation, Prisma schema, reservation, ledger or Gemini changes.

Live acceptance command, after Agent/API builds and `npm.cmd test`:

```powershell
node apps/api/tests/native-tool-live.cjs --confirm-development-read-only
```

Local development database only. PostgreSQL enforces read-only connections and
repeatable-read transaction. Test selects existing active authorized actor and ingredient;
backend reads share transaction snapshot. It compares tool output with direct Backend
output and counts actual Prisma queries without storing SQL or credentials.
No fixtures, seed, migration, application bootstrap, jobs or paid API retries.

Live result: **BLOCKED_NO_AUTHORIZED_ACTOR**. PostgreSQL read-only preflight passed;
no active ADMIN/STAFF found. Provider requests: 0. Tool executions: 0. Database writes: 0.
No native provider or stock-result acceptance claim. Do not create users/data merely to
pass test; use intended development database containing existing authorized test data.

Builds pass; focused planner suite 44/44, additional native runtime suite 9/9.
Full suite: 310/310 passed, 0 failed, 0 skipped, exit code 0. Full-suite log,
verification summary and separate live report stored alongside this document.

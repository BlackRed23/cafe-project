# Recovery R3 — test evidence

Reviewed execution: ten explicit CJS suites use synthetic persistence/provider boundaries, in-memory TypeScript transpilation and TEST_IN_PROCESS=1 / TEST_REAL_HTTP=0. Reused R2 reviewed allowlist; expanded purchase-receipt-validation adds four numeric-boundary tests importing only validators with an allowlisted mock database enum. No API/worker/service bootstrap against a live DB; no SQL execution, Prisma generation, seed, migration, reset, restore, or network provider calls.

Exact commands, timestamps, exit codes: [execution metadata](evidence/execution-metadata-r3.json). Raw [regression](evidence/r3-regression.log), [API typecheck](evidence/r3-api-typecheck.log), [Agent typecheck](evidence/r3-agent-typecheck.log).

| Check | Actual | Limits |
|---|---|---|
| Full reviewed node --test allowlist | exit0;94 tests,94 pass,0 fail,0 skip | Unit/mock/in-process; NOT PostgreSQL integration |
| API tsc --noEmit | exit0 | Installed generated legacy client15 models/6 enums |
| Agent tsc --noEmit | exit0 | Same generated-client limitation |
| Targeted purchase-receipt-validation | exit0;7/7 | Included again in94; do not add counts |
| git diff --check | exit0 | Only line-ending conversion warnings |
| PostgreSQL migration/concurrency/rollback/restore | NOT RUN | Explicit task constraint |

New expected/actual: Infinity, -Infinity, NaN, Infinity string and1e999 rejected for unitPrice and purchaseQuantity; zero price, finite fractions, numeric strings, optional/null price retained. All assertions passed. Finite validation does not enforce approved monetary precision/rounding or stock maximum; these remain decisions. Existing90 cases retained. No new test claimed as TC-05 PostgreSQL acceptance.

R2 reports preserved before R3 append updates. Historical WEEK_01…05 and WEEK_04_AUDIT hashes must match prior manifest; R3 manifest records this check, inputs and artifact hashes. Previous R1/R2 logs are unchanged.

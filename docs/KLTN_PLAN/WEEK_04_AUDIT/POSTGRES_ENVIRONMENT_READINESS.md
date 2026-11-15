# PostgreSQL local environment readiness

Inspection date: 2026-11-05 (Asia/Saigon). Documentation only: no service was installed or started, no PostgreSQL connection was attempted, and no application configuration or database state was changed.

## Observed readiness

| Item | Evidence / status |
|---|---|
| Docker CLI | Not on PATH; standard Docker Desktop CLI path absent. Docker availability in other installations or WSL is unknown. |
| PostgreSQL client | Available: `C:\Program Files\PostgreSQL\16\bin\psql.exe` reports 16.15; version 18 equivalent reports 18.6. Both versions have `pg_isready.exe`. Neither client is on PATH. Version checks do not connect. |
| Node/npm | Available under `C:\Program Files\nodejs`. Root package requires Node >=18; Docker uses Node 20. |
| WSL | Executable present; no distribution was started or inspected. |
| Active API/database | UNKNOWN. Earlier local metadata inspection found no matching processes/listeners; CIM process access was denied. This does not exclude another host or environment. |
| Dedicated audit role | No configured dedicated read-only source found in inspected local configuration; external sources remain unknown. |
| Live object counts | UNKNOWN; user reports 27 tables. Source declares 31 models and 16 ENUMs, including four transitional legacy models. |

## Supported runtime options and required software

1. **Windows API + existing PostgreSQL:** npm workspace scripts support `dev` through nodemon/ts-node and `start` through `node dist/index.js`. Requires compatible Node/npm, dependencies and built output for start; PostgreSQL may be native Windows, an existing container, or an explicitly confirmed remote development instance. Windows psql is sufficient for a later authorized audit; running the API is unnecessary.
2. **Docker Compose:** repository defines postgres (PostgreSQL 15 Alpine), api, agent and web. Requires Docker Engine/Desktop and Compose v2. Configured API target is Docker DNS host `postgres`, port `5432`, database `cafedb`; PostgreSQL publishes Windows port `5432`. Schema is implicitly Prisma default `public`; NODE_ENV is development. These are configured values, not verified runtime values. Windows clients cannot generally resolve the Docker service name; the published endpoint must be independently confirmed.
3. **Other environment:** Node/Docker deployment is possible elsewhere, but no active remote or WSL deployment is established. Do not infer deployment from source files.

Do not run installation or startup commands for this audit. In particular, `apps/api/Dockerfile` CMD runs `prisma migrate deploy` before starting the API. Do not run `docker compose up`, that image's default command, README setup steps, db:push, seed, migrations or rollback. Existing tables may already be present. Starting the API also schedules jobs and is unnecessary for catalog verification.

## Existing configuration sources

- `docker-compose.yml`: service definitions, API/agent DATABASE_URL, PostgreSQL database, port mapping and development environment. Do not print its raw contents: it contains credentials. Compose overrides, interpolation, selected project and container metadata may change effective values.
- `apps/api/package.json`: dev/build/start scripts. Root package uses npm workspaces and Turbo.
- `apps/api/src/common/env.ts`: `dotenv.config()` loads `.env` from process working directory; existing process environment normally takes precedence. PORT defaults to 5000; NODE_ENV defaults to development. Actual cwd and inherited environment must be verified per process.
- `packages/database/prisma/schema/main.prisma`: PostgreSQL datasource reads DATABASE_URL. `packages/database/src/index.ts` creates PrismaClient without an explicit datasource override.
- `packages/database/package.json`: schema directory and potentially mutating db:push/seed scripts.
- `apps/api/.env.example`: example `localhost:5432/cafe_project`, explicit public schema; not active evidence. Inspected root/API/database dotenv locations had no real `.env` file. Ignored files and an external secret manager must be checked locally without publishing values.
- `packages/database/prisma/schema/migrations` and `packages/database/prisma/migration_27_tables`: historical/candidate SQL, not proof of applied state. In particular, `03_verify.sql` writes persistent verification results and must not be used for this read-only procedure.

## Safe environment verification commands (no authentication)

Run only on the intended machine. These commands inspect local metadata; they do not start services or connect to PostgreSQL.

```powershell
Get-Command docker,psql,pg_isready,node,npm -ErrorAction SilentlyContinue |
    Select-Object Name,Source
& 'C:\Program Files\PostgreSQL\16\bin\psql.exe' --version
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' --version
Get-Service -Name '*postgres*','*docker*' -ErrorAction SilentlyContinue |
    Select-Object Name,Status
Get-Process -Name node,postgres,'com.docker.backend' -ErrorAction SilentlyContinue |
    Select-Object Id,ProcessName,Path
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object LocalPort -in 5000,5432,5433 |
    Select-Object LocalAddress,LocalPort,OwningProcess
# Names only, never values:
Get-ChildItem Env: |
    Where-Object Name -match 'DATABASE|POSTGRES|^PG|COMPOSE|DOCKER|READ.?ONLY' |
    Select-Object -ExpandProperty Name
```

If Docker is later available and already running, metadata-only commands are:

```powershell
docker context show
docker compose ls --format json
docker compose config --services
docker ps --format '{{.ID}} {{.Names}} {{.Image}} {{.Status}} {{.Ports}}'
# Replace the name only after identifying the actual API container.
docker inspect --format '{{.State.Status}} {{.Config.WorkingDir}} {{index .Config.Labels "com.docker.compose.project.config_files"}}' cafe_api
```

Do not dump full `docker inspect`, rendered Compose configuration, environment values, process command lines or logs: these may contain passwords/URLs. Do not invoke pg_isready in this stage; it performs a server probe. Missing metadata privileges mean UNKNOWN, not STOPPED. No psql binary was found in the inspected project filename inventory; use the verified absolute Windows paths above.

## Identifying the active target and excluding production

1. Locate the running API using process/container ownership, listener PID, deployment identity and working directory. If inaccessible, ask the operator for redacted runtime evidence; do not start a new instance to manufacture evidence.
2. Establish selected Compose files/project/context or Windows launcher/service and inherited configuration. Have the operator inspect the effective API DATABASE_URL privately and provide only host, port, database, schema and environment. Never publish userinfo, full URL or unrelated query parameters. Account for datasource defaults and proxies/tunnels.
3. Correlate the API target with the PostgreSQL container/network/published port or native PostgreSQL service. Configuration plus running process linkage is stronger than an example file. Existing redacted connection telemetry can support actual use; do not call application routes that might write data.
4. Require owner confirmation that the exact endpoint/database/schema belongs to an isolated local/development instance. Corroborate with deployment inventory, Docker context/host, volume ownership, network destination and any tunnel/forwarding destination. `localhost`, database name, Docker presence and NODE_ENV=development alone do not exclude production.
5. If environment identity or API linkage is unresolved, retain PARTIAL/UNKNOWN and stop before authentication. Catalog identity queries below corroborate the connected endpoint but cannot themselves prove non-production ownership.

## Required dedicated read-only access

An administrator must supply an existing, separately managed audit identity and approved secret source; application/default Compose credentials are prohibited. This task does not create roles or grant privileges.

Required minimum for this catalog-only audit: LOGIN and CONNECT to the approved database, access to the relevant pg_catalog metadata (normally public), and visibility of the approved schema. Require USAGE on that schema for any later approved object inspection. SELECT on business tables is unnecessary for these catalog counts; grant it only under a separate data-inspection scope. No superuser, database/schema/table ownership, CREATEDB, CREATEROLE, replication, BYPASSRLS, writable role memberships or SET ROLE escalation. Review effective inherited/PUBLIC privileges as well as direct grants; no CREATE/TEMP/write privileges or executable routines that enable writes. Default transaction_read_only should be on as defense in depth, not a substitute for privileges.

Use an approved credential manager or interactive password prompt; do not place secrets in commands, source files, reports or connection URLs. An existing role's name alone does not prove read-only access: administrator evidence must cover role attributes, memberships and effective grants.

## Conditions before any database query

All must be satisfied:

- Exact host/port/database/schema and execution environment confirmed by the user; non-production ownership corroborated.
- User explicitly authorizes read-only authentication and the catalog query scope. This report is not that authorization.
- Existing dedicated audit identity and secret source supplied; effective privileges reviewed. Never fall back to application credentials.
- Approved endpoint mapping and TLS policy known; remote connections use appropriate certificate verification.
- Query text reviewed: only the catalog SELECTs below, inside a read-only transaction. No repository SQL scripts, Prisma commands, DDL, DML, migration, rollback, seed or service startup.
- Agree where sanitized identity, names, counts and timestamps will be recorded. No business rows or credentials are needed.

After those gates only, a future operator may launch psql with explicit separate `--host`, `--port`, `--dbname`, `--username`, `--password`, `-X` and `--set=ON_ERROR_STOP=1` arguments. Fill nonsecret arguments from the confirmed target; use the prompt for the audit password. `-X` skips psql startup files. Establish read-only session settings before queries, e.g. process-scoped PGOPTIONS `-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=2000`. Do not execute this connection step during documentation work.

## Proposed catalog-only verification SQL — NOT EXECUTED

Replace `public` only with the approved schema. Run the entire inspection in one read-only, repeatable snapshot. Queries count objects, not business rows. Permission errors are blockers, never a reason to switch credentials.

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SHOW transaction_read_only;
SELECT current_timestamp AS observed_at, current_database() AS database_name,
       current_user AS audit_role, inet_server_addr() AS server_address,
       inet_server_port() AS server_port, current_schema() AS default_schema,
       current_setting('search_path') AS search_path;

-- Physical ordinary/partitioned root tables, excluding partitions and Prisma metadata.
-- Return full names so backup/support/legacy objects cannot hide in a single count.
SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.relkind, count(*) OVER () AS schema_table_count
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p') AND NOT c.relispartition
  AND c.relname <> '_prisma_migrations'
ORDER BY c.relname;

-- Exact comparison against the 27 intended business names; no silent extras.
WITH expected(name) AS (
  VALUES ('Category'), ('User'), ('Product'), ('Recipe'), ('RecipeIngredient'),
    ('Topping'), ('ToppingIngredient'), ('Ingredient'), ('IngredientBatch'),
    ('InventoryTransaction'), ('StockCount'), ('StockCountItem'), ('Order'),
    ('OrderItem'), ('OrderItemTopping'), ('Payment'), ('PaymentCallback'),
    ('PaymentReconciliation'), ('PurchaseRequest'), ('PurchaseRequestItem'),
    ('GoodsReceipt'), ('Supplier'), ('SupplierIngredient'), ('AgentExecution'),
    ('AgentToolCall'), ('AgentEvaluation'), ('SystemSetting')
), actual AS (
  SELECT c.relname::text AS name
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND NOT c.relispartition AND c.relname <> '_prisma_migrations'
)
SELECT coalesce(e.name, a.name) AS table_name,
       CASE WHEN e.name IS NULL THEN 'UNEXPECTED'
            WHEN a.name IS NULL THEN 'MISSING' ELSE 'MATCH' END AS result,
       count(*) FILTER (WHERE e.name IS NOT NULL AND a.name IS NOT NULL)
         OVER () AS matched_business_table_count
FROM expected e FULL JOIN actual a USING (name)
ORDER BY table_name;

-- Count each ENUM type once; preserve ordered labels for comparison.
WITH enum_inventory AS (
  SELECT n.nspname AS schema_name, t.typname AS enum_name,
         array_agg(e.enumlabel ORDER BY e.enumsortorder) AS ordered_labels
  FROM pg_catalog.pg_type t
  JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
  JOIN pg_catalog.pg_enum e ON e.enumtypid = t.oid
  WHERE n.nspname = 'public' AND t.typtype = 'e'
  GROUP BY n.nspname, t.oid, t.typname
)
SELECT *, count(*) OVER () AS enum_type_count
FROM enum_inventory ORDER BY enum_name;
COMMIT;
```

If an inventory query returns zero rows, its window count is absent, meaning zero objects matched; do not interpret absence as a successful target confirmation. Root partition count is one logical table; partition children, views, foreign tables and other schemas are outside this definition and require explicit scope if relevant.

## Evidence required for 27 tables and 16 ENUMs

Preserve the approved redacted target, owner/environment confirmation, runtime linkage evidence, audit role privilege evidence, timestamp, exact query text and complete results from the same snapshot. Show transaction_read_only=on. Server address can differ from the supplied host because of NAT/proxies; explain the mapping.

Require 27 MATCH rows with no MISSING rows. Review every UNEXPECTED row: `_prisma_migrations` is excluded explicitly; backup/support objects must be classified and reported separately, not silently removed to force 27. Transitional Inventory, InventoryBatch, SupplierProduct and AgentLog must be reported if physically present. A claim of exactly 27 physical business tables needs agreement on every table's classification and no unaccounted business extras.

Require 16 distinct ENUM types with names and ordered labels reconciled to the approved design. Source names are CategoryKind, InventoryTransactionType, WasteReason, StockCountStatus, OrderStatus, ConsumptionStatus, PaymentStatus, PaymentMethod, TransactionStatus, CallbackStatus, ToppingType, PurchaseRequestStatus, GoodsReceiptStatus, ExecutionStatus, ToolCallStatus and UserRole. Compare labels with current schema declarations and the owner's authoritative design; matching counts alone do not prove matching definitions.

The current 31 Prisma models / 16 ENUM declarations are source evidence only. Neither this report nor a matching catalog count proves API integration, constraints, indexes, migration history or data correctness. No table should be recreated, removed or migrated to make the result match expectations.

## Next action

Have the operator confirm the active runtime and non-production target, and identify an existing dedicated audit credential source. Obtain explicit user authorization for the proposed catalog-only inspection before authenticating. Until then: readiness BLOCKED; active database UNKNOWN. Installed psql clients can be used by absolute path without installation or PATH/configuration changes.

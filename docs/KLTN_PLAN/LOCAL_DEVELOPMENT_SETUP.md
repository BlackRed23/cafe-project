# Windows local development setup — Café AI System

Prepared 2026-11-05 (Asia/Saigon). Status: **PARTIAL**. This is a preparation guide, not a record of successful application startup or migration readiness. No service, installer, application, test suite or database connection was started. Only this document was created for this task.

## Current environment inventory

| Component | Observed evidence | Readiness |
|---|---|---|
| Windows workspace | `D:\KLTN\source\cafe-project`; PowerShell | Available |
| Node.js / npm | Node v24.21.0; npm 11.19.0. Root requires Node >=18 and declares npm@11.6.2. | Present; npm differs from declared toolchain; no version change performed |
| Dependencies | node_modules and package-lock.json present. Offline npm dependency inventory reported no problems. ts-node, nodemon, tsx and Prisma command shims exist. | Installed; inventory does not prove all builds/runtime paths work |
| Prisma | Installed CLI package and @prisma/client both 6.19.3; generated client directory exists. | Present; generated schema freshness and live compatibility unverified |
| PostgreSQL | Versions 16 and 18 contain postgres.exe, pg_ctl.exe and psql.exe under `C:\Program Files\PostgreSQL\<version>\bin`. psql reports 16.15 / 18.6. pg_isready binaries also present. | Server installation files present; active cluster/version unknown |
| PostgreSQL service | Get-Service could not open Service Control Manager. No postgres process or listener on inspected 5432/5433 ports was observed through available metadata. | UNKNOWN, not proven stopped or absent |
| Docker | CLI not on PATH; standard Docker Desktop CLI location absent. | Not required for this workflow |
| Frontend | React/Vite; installed Vite 8.0.16. Package requests TypeScript ~6.0.2 but dependency tree shows 5.9.2 deduplicated. | Scripts/dependencies present; build unverified; resolve TypeScript/toolchain consistency before declaring ready |
| Backend / Agent | Built entry files and database package dist exist. | Existing output can be stale; not booted or validated |
| Configuration | No actual dotenv files found in inspected root/API/Agent/database locations; example files are not active configuration. No matching database/Agent/JWT/Vite environment names appeared in this inspection process. | External launcher/secret sources unknown |
| Database | Active database, ownership, schema contents and application compatibility unknown. | Preserve all existing data; user reports 27 tables, not independently verified |

No new software installation is established as necessary: Node, PostgreSQL binaries and clients already exist. Missing prerequisites are confirmed cluster/service identity, isolated development target, suitable separate credentials, effective environment configuration and verified source/client/database compatibility. Full dependency/build reproducibility remains unverified; do not reinstall or upgrade automatically.

## Recommended Windows architecture

Use an explicitly selected existing local PostgreSQL instance, one API process at loopback port 5000, one Agent HTTP server at loopback port 5055, and Vite at loopback port 5173. Keep worker scheduling disabled by not launching the worker during initial validation. Frontend calls API; API calls Agent using the shared internal token. API and Agent must use the same approved development database/schema. Audit inspection uses a separate read-only identity, never the application login.

Recommend a separately owned database named `cafe_ai_local_dev` on a confirmed local cluster, with `public` only if consistent with the approved design. This is a proposed name, not an existing or created database. If that name already exists, stop and verify ownership/content; never overwrite it. Prefer an already approved development database or a separately authorized, sanitized copy from an approved source. Creating a database, restoring a copy or provisioning roles requires a later explicit task. No schema creation/migration is implied here.

## Environment requirements and loading

Values must stay in approved local secret storage or separately authorized ignored workspace dotenv files. No secret values or connection URLs belong in this guide. No environment file was changed.

| Process / feature | Variable names and requirements |
|---|---|
| API core | DATABASE_URL points to approved isolated DB; JWT_SECRET is mandatory at startup. PORT (default 5000), NODE_ENV, JWT_EXPIRES_IN, FRONTEND_URL, CORS_ORIGIN, CLIENT_URL configure runtime/auth/origins. |
| API → Agent | AGENT_BASE_URL, AGENT_INTERNAL_TOKEN (same secret on API and Agent), AGENT_SERVICE_TIMEOUT_MS. Agent token must be nonempty. |
| API cron safety | ENABLE_PRODUCT_PURGE_CRON=false and RUN_CRON_ON_START=false for initial local validation. PRODUCT_PURGE_CRON_SCHEDULE controls the purge schedule if later enabled. Defaults enable scheduled product purge. |
| Agent core | DATABASE_URL; AGENT_INTERNAL_TOKEN; AGENT_HOST (default loopback); AGENT_PORT (default 5055) or PORT. PORT takes precedence over AGENT_PORT. |
| Agent AI / behavior | GEMINI_API_KEY; fallback names GEMINI_API_KEY1, GEMINI_API_KEY2, GEMINI_API_KEY3 are supported by Gemini service; GEMINI_MODEL; AGENT_RECOMMENDATION_MODE selects gemini when explicitly set. Missing Gemini key is logged by config; rule-based behavior exists, but feature readiness must be tested separately. AGENT_DEMO_FAILURE_MODE is a development failure simulation control; keep unset. |
| Agent worker | RUN_ON_START=false prevents immediate scan but does not disable scheduled scans. DEBUG_MODE; AGENT_SCAN_CRON is declared in env config, but current scheduler uses database settings ai.enabled / ai.scanCron and falls back to its own daily schedule. Do not assume this environment variable controls scheduling. |
| Frontend | VITE_API_URL for API base; VITE_GOOGLE_CLIENT_ID for an approved local OAuth setup. Every VITE_* value is browser-visible; never put secrets there. |
| Optional integrations | SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM for email; CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET for uploads. Legacy aliases Cloud_Name, API_Key, API_Secret also exist; avoid conflicting sources. Do not use production email/upload resources for initial tests. |

API and Agent call dotenv.config(), so `.env` resolution depends on process working directory and existing inherited environment normally wins. npm workspace scripts execute in their workspace directory: local files would be apps/api/.env and apps/agent/.env. Vite reads its workspace dotenv files (including mode-specific files); API/Agent default dotenv loading does not automatically emulate Vite's mode-file behavior. Prisma CLI run through the database workspace uses its schema configuration and its own dotenv discovery; do not assume it shares the API's environment. Record effective sources separately without printing secrets.

### Connection and runtime conflicts to resolve

- Compose uses Docker DNS `postgres`, database `cafedb`; Windows API example uses localhost, database `cafe_project`. Neither establishes the active target. Docker service DNS is unsuitable for native Windows without an explicit mapping.
- Installed PostgreSQL 16 and 18 may represent different clusters and ports; do not infer a port from installation folder or psql version. Compose's port 5432 may conflict with a native instance if Docker is introduced later.
- Root shell DATABASE_URL can override workspace dotenv values; API, Agent and Prisma CLI may then resolve different databases. Confirm all separately with sanitized tuples.
- Do not share a single global PORT across API and Agent; inherited PORT=5000 overrides Agent's AGENT_PORT and causes a collision.
- Browser client defaults to an absolute localhost API URL; Vite also proxies `/api` to 127.0.0.1:5000. Select one consistent routing convention later; relative `/api` can use the existing proxy. Keep API CORS origins aligned with the actual Vite origin.
- Prisma source declares 31 models and 16 ENUMs, with four transitional legacy models; intended business design is 27 tables. Existing generated code and dist are not evidence that current source matches the database. Review DATABASE_REVERIFICATION.md before assuming integration readiness.

## PostgreSQL setup and safety procedure

1. Ask the operator to inspect Windows Services and identify each PostgreSQL service, status, executable version, configured data directory and port locally. Service-manager access was denied here. Do not start/stop services, initialize a cluster or expose process arguments/config files containing secrets.
2. Recheck local metadata using the commands below; unavailable privileges mean UNKNOWN. A listening port alone does not identify database ownership.
3. Owner confirms the intended host/port/database/schema and proves it is local development through cluster/service ownership, deployment inventory and any tunnel/forward destination. localhost, NODE_ENV and a development-sounding database name are insufficient proof.
4. Record existing databases as preserved and uninspected. Do not connect as postgres, the Compose default login or any privileged application role. Never assume a database is empty or missing.
5. Identify an existing dedicated audit role with CONNECT and relevant catalog visibility; review inherited/PUBLIC permissions. It must not own objects or have elevated/write privileges. Consult POSTGRES_ENVIRONMENT_READINESS.md for detailed gates and proposed read-only catalog queries.
6. Obtain explicit target confirmation and read-only inspection authorization before any authentication/query. That later audit can corroborate identity and the existing 27 business tables / 16 ENUMs without reading business rows.
7. After audit and compatibility review, separately approve the development application's least-privilege DML identity. It must be scoped to the isolated development database; no superuser, role/database creation or DDL authority. Audit credentials and application credentials remain separate.
8. If a development database/copy is still needed, stop for a separate approved provisioning procedure. Do not use migrations or resets to force a match. Preserve the original cluster and data.

Safe metadata commands, not service-start commands:

```powershell
Get-Command node,npm,psql,pg_isready -ErrorAction SilentlyContinue | Select-Object Name,Source
node --version
npm --version
& 'C:\Program Files\PostgreSQL\16\bin\psql.exe' --version
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' --version
Get-Service -Name '*postgres*' -ErrorAction SilentlyContinue | Select-Object Name,Status
Get-Process -Name postgres -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,Path
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object LocalPort -in 5432,5433,5000,5055,5173 |
    Select-Object LocalAddress,LocalPort,OwningProcess
```

Do not run pg_isready or psql connections during preparation. Do not print raw dotenv files, DATABASE_URL, full environment dumps or credentials.

## Project-specific commands for later approved local execution

The following commands were derived from inspected package scripts. **They were not executed.** Run from `D:\KLTN\source\cafe-project` only after the development target, credentials, configuration, dependency consistency and schema/client compatibility are approved. Application startup is a separate authorization from read-only catalog inspection.

Database library/client preparation (writes generated files/build output, not database schema; requires a later implementation step):

```powershell
npm run generate -w @cafe-project/database
npm run build -w @cafe-project/database
```

Client generation reflects source only; it does not repair a live database mismatch. Do not execute it until the intended schema/client contract has been established. Installation is not needed merely because this guide lists prerequisites. A future approved clean install should review npm lifecycle effects and the lockfile/toolchain first.

Use separate terminals, with process-specific approved environments:

```powershell
# Terminal 1: Agent HTTP server only (no scheduled worker bootstrap)
npm run dev:server -w @cafe-project/agent
# Terminal 2: API; initial cron controls described above must be effective
npm run dev -w @cafe-project/api
# Terminal 3: frontend; force expected port instead of silently selecting another
npm run dev -w @cafe-project/web -- --host 127.0.0.1 --port 5173 --strictPort
```

API dev script is `nodemon src/index.ts` and requires installed ts-node. Agent server dev script is `tsx src/server.ts`. Vite dev script is `vite`. Agent server endpoints can still write when called; server-only does not make the application read-only.

Built alternatives after separately approved build checks:

```powershell
npm run build -w @cafe-project/agent
npm run build -w @cafe-project/api
npm run build -w @cafe-project/web
npm run start:server -w @cafe-project/agent
npm run start -w @cafe-project/api
# Frontend preview is an alternative to dev, not a production service:
npm run preview -w @cafe-project/web -- --host 127.0.0.1 --port 4173 --strictPort
```

For later worker feature work only: `npm run dev:worker -w @cafe-project/agent` starts a database-connected scheduler; `npm run scan -w @cafe-project/agent` runs a scan that can write. Neither belongs in initial safe validation. Agent `dev`/`start` import both server and worker. Root `npm run dev` launches all dev scripts through Turbo and therefore includes that worker; do not use it initially.

Prohibited for this preparation and Week 04 while blocked: db:push, db:seed, prisma migrate/reset, migration SQL, precheck/verify phase scripts, contract or rollback scripts. The existing `03_verify.sql` is not read-only. README installation steps include database mutation and must not be followed wholesale.

## Local testing procedure (future work, not executed)

1. Verify dependency/toolchain consistency and review generated-client freshness without using DB commands. Run workspace builds only as a separately approved implementation step; capture failures rather than changing the database to satisfy them.
2. A reviewed mocked regression entry point exists: `node --test apps/api/tests/auth-registration.test.cjs` substitutes Prisma and does not use a real database. It creates test HTTP listeners; inspect before running. Other test files exist under apps/api/tests and apps/agent/tests; review isolation and network/process behavior individually before execution. Package files have no standard test script; do not invent `npm test` or run all tests blindly.
3. Once application startup is authorized against the isolated target, use the three-terminal sequence. Confirm listeners belong to the intended processes. GET `http://127.0.0.1:5000/health` and `http://127.0.0.1:5055/health`, then open `http://127.0.0.1:5173`. These health routes do not prove database connectivity or schema compatibility.
4. Check browser console/network and API → Agent auth/origin configuration. Do not trigger login, inventory scans, registrations, emails, uploads, demo sales, purge or purchase workflows as a supposedly read-only smoke test: these can write or contact external services.
5. After explicit functional-test approval, use approved development fixtures only. Record before/after expectations for writable workflows and stop processes with Ctrl+C afterwards; stopping an app does not undo its writes. No automated data cleanup/reset is authorized.

## Week 04 prerequisites and separate gates

**Development readiness:** installed software, confirmed isolated database, effective per-process configuration, least-privilege app credentials, reviewed source/generated-client/physical-schema compatibility, reviewed cron behavior and passing relevant build/smoke checks. This is currently PARTIAL.

**Read-only audit readiness:** confirmed non-production endpoint, separate reviewed audit identity, explicit authentication/query authorization and sanitized evidence capture. This is currently BLOCKED. Confirm exact names and ordered ENUM labels as well as 27/16 counts; source declarations alone are insufficient.

**Migration/rollback readiness:** remains BLOCKED independently of local startup. Require authoritative approved schema/DDL, actual catalog/migration-history evidence, resolution of documented source/API/schema gaps, reviewed data-preservation mapping, backups with demonstrated restore, isolated rehearsal results, explicit bounded migration plan/approval and validated rollback strategy. A working local API or an existing 27-table database is not migration approval. Do not replay migration or rollback scripts to establish readiness.

Related evidence: WEEK_04_AUDIT/POSTGRES_ENVIRONMENT_READINESS.md, DATABASE_REVERIFICATION.md, DATABASE_AUDIT.md and MIGRATION_SAFETY_AUDIT.md. Earlier documents are evidence with stated limits, not permission to execute their candidate scripts.

## Future Docker integration plan

Keep Windows workflow independent for now. In a separate implementation task, review Docker/Compose availability, align Node/npm and PostgreSQL versions with the verified Windows contract, parameterize nonsecret endpoints and secret sources, and choose isolated named volumes/database identities. Resolve localhost versus Docker DNS and port collisions explicitly. Review Agent loopback binding for container networking; its server currently defaults to 127.0.0.1.

Remove or gate automatic migration from API container startup through a separately approved change before using it with preserved databases. Review worker scheduling and add explicit startup/health behavior. Do not mount an existing Windows PostgreSQL data directory directly into a different major-version container. Any data transfer must use a separately authorized backup/restore plan. Validate Docker first against an isolated development copy, with no production credentials and no automatic migration/seed/rollback.

## Next action

Operator verifies local PostgreSQL service/cluster identity and supplies the redacted target plus existing audit credential source. Obtain explicit read-only inspection authorization, establish the live schema contract and then approve environment preparation/startup separately. No software, service, environment or database changes are needed to deliver this guide.

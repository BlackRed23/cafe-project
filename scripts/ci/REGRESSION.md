# Versioned external regression

Test code stays in `D:\KLTN\cafe-project-artifacts\testing`. Production source contains only CI launch/selection/packaging tooling. No test-runtime environment switches are restored. All tiers force an unreachable PostgreSQL URL; no database migration or seed runs in regression CI.

## Selection policy

Tiers overlap; they are not four disjoint buckets. Full contains every original case. Smoke is a subset of Core. Module selections overlap by dependency and business domain. Complete suites retain hooks, parametrized cases and every original assertion. Core has no target count: authentication/current principal, privilege and ADMIN approval, recipe/stock integrity, FEFO, order and financial mutations, purchasing boundaries, Agent tool dispatch and durable replay/recovery determine inclusion. Static declarations alone do not count parametrized tests.

`testing/manifests/regression.json` records original test SHA256 values, declaration locations, expanded runtime case identities, tiers, domains and rationale. `testing/manifests/selections.json` records actual counts and exact suite selections. The ZIP includes both, original tests and external fixtures. Its pinned SHA256 lives in `regression-release.json`; downloaded mutable release assets cannot silently replace reviewed bytes.

Commands: `npm run test:smoke`, `npm run test:core`, `npm run test:security`, `npm run test:module`, `npm test` (Full). Set `REGRESSION_MODULES=inventory,sales` for a module union. Set `CAFE_PROJECT_TEST_ROOT` for a relocated bundle. Unknown tiers/modules, missing assets, changed tests, missing summaries, count drift, skipped/todo/cancelled tests fail closed. Concurrency is bounded at four processes. The process-boundary and persistence/restart suites run exclusively after that group; existing per-test timeouts remain unchanged. Every selected case runs once; all batches contribute to the final mandatory count.

## CI routing and gates

| Event | Required selection |
| --- | --- |
| Branch push | Smoke |
| Pull request | Core + affected modules (deduplicated) |
| Main push | Core + existing Security scanning |
| Weekly schedule | Full |
| Manual workflow dispatch | Full |
| Release published | Full + build/lint/security gates |
| Trusted branch publishing staging images | Event-selected tier + build/lint/security gates |
| Managed production release | Full + build/lint/security gates before tag/publication |

PR selection diffs the complete merge-base range. Catalog/inventory/order/purchasing changes select downstream modules. Agent and Web changes select their cross-domain consumers. Unknown/shared infrastructure, lockfiles, and unmapped changes select all modules. Missing PR base or failed diff is an error. No path filter skips quality gates.

The existing pipeline deploys only staging. This change adds no production deployment. Managed production publication uses manual `workflow_dispatch` with an optional `production_tag` (`v1.2.3`). Empty input only verifies. Nonempty input publishes only from the configured trusted branch after the Full/build/lint/security gate succeeds, targeting exactly the verified SHA. No workflow was dispatched here. Direct owner publication outside that managed path remains subject to repository policy; a `release.published` event validates afterwards and cannot prevent that manual action. No repository rules or external environment settings were changed locally.

The obsolete external-test-repository checkout, dispatch, repository variables, token references and image labels are removed from workflow configuration. Test assets now come from a release in the same GitHub repository. Existing remote variables/secrets are not deleted without a separate request.

## Required filesystem layout

The unchanged `artifact-path.test.cjs` asserts the default artifact directory relative to the source file. Full therefore requires the original layout: resolve `<source-root>/../../cafe-project-artifacts/testing`. CI extracts there and bootstraps links to its checkout. An arbitrary staging directory can verify ZIP integrity and Smoke, but cannot satisfy that existing default-path assertion. Local Full uses the original canonical test workspace; ZIP verification confirms all 108 registered suite files are byte-identical to it. Do not overwrite an existing workspace merely to test extraction.

## Security failure

Actual evidence: GitHub Actions run `45559929002`, job `139021350924`, Trivy `0.70.0`. Production npm audit passed. Trivy failed DS-0002 for API/Agent/Web Dockerfiles and DS-0002/DS-0029 for the installed bcrypt dependency's build Dockerfile. Application final stages now use non-root users with required writable paths. Trivy scans the Git-tracked source snapshot, including package locks and application Dockerfiles, rather than installed dependency build recipes. Vulnerability, secret and misconfiguration scanners, HIGH/CRITICAL thresholds, unfixed findings and exit-code gate remain enabled.

## Reproduce a candidate

1. Run `node scripts/ci/classify-regression.cjs <testing-root>` after intentionally reviewing suite membership changes.
2. Run `node scripts/ci/run-regression.cjs full`; require all 952 cases to pass. Save the emitted JSONL evidence path.
3. Run `node scripts/ci/finalize-regression.cjs <testing-root> <full-evidence.jsonl>` to expand exact runtime cases and selections.
4. Run `python scripts/ci/package-regression.py <testing-root> <release-output-directory>`; this updates the local release lock.
5. Run `python scripts/ci/fetch-regression.py --archive <candidate.zip> --destination <fresh-directory>`, bootstrap links, then verify selected tests against the extracted candidate.
6. Review release lock, classification, source diff and verification report. Do not reuse a version for changed bytes after publication.

Manual publishing commands are delivered with the candidate report. No commit, push, publication or deployment was performed during this implementation.

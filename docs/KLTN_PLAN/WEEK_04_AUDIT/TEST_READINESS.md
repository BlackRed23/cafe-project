# Current reverification — 05/11/2026 (Asia/Saigon)

Live database verification is NOT RUN / PENDING INPUT, not PASS. First collect read-only catalog and migration evidence against the confirmed existing target. Replay/rehearsal is not a prerequisite for verifying existing objects. Existing migration/restore and application tests remain unexecuted here; no mock or user-reported table count closes runtime evidence gaps.

See [DATABASE_REVERIFICATION.md](DATABASE_REVERIFICATION.md) for current evidence, scope, migration hashes, unresolved live checks and readiness calculation. This update supersedes conflicting assumptions in the historical 03/11/2026 audit below. The user confirms an existing 27-table database; that confirmation is distinct from independently verified PostgreSQL evidence. No database query or object change has been performed.

---

# Audit mức sẵn sàng kiểm thử

03/11/2026. **Không chạy test trong audit.** VERIFIED PASS/VERIFIED FAIL chỉ dùng khi có execution evidence gắn phiên bản và môi trường; test source tồn tại không đủ. Không có kết quả nào đủ điều kiện hai nhãn đó. NOT RUN là trạng thái phiên audit; lịch sử thực thi không có log được xác minh là UNKNOWN.

## Kiểm kê bộ kiểm thử hiện hữu

Mỗi test case bên trong các tệp dưới đây đều **NOT RUN trong audit; kết quả lịch sử UNKNOWN**. Các vòng lặp sinh case cũng theo quy tắc này, không tự đếm là PASS. Định nghĩa test VERIFIED qua đọc source.

| Tệp và dòng chứng cứ | Loại và nội dung có thể kiểm | Giới hạn |
|---|---|---|
| `apps/api/tests/auth-registration.test.cjs:1–2,29–94,128–190` | Unit/API in-process hoặc loopback: register CUSTOMER, privileged role rejection, hash, duplicate email, login/JWT, ADMIN route | Prisma/env được mock; chưa có revoke/role đổi sau cấp token; không DB |
| `apps/api/tests/inventory-consistency.test.cjs:1,26–95,100–301` | Unit/contract: stock delta, selected batch, reservation, duplicate batch, injected failures, invalid expiry/delta, role routes, Agent effects sau thành công | Transaction clone mock tự bỏ draft khi lỗi, không phải rollback/row locking PostgreSQL; JWT/persistence mock |
| `apps/api/tests/inventory-ui-contract.test.cjs:9–36,44–95` | UI static rendering/source assertions; web payload; simulate sale restore và order atomic delta với mock | Restore ở đây là khôi phục sale trong mock, **không phải database backup restore**; không browser E2E |
| `apps/api/tests/test-db-security.test.cjs:26–102` | Bootstrap health/mount, /test-db 404, không access DB | Router/cron/DB được thay thế; không chứng minh DB endpoint production |
| `apps/agent/tests/internal-auth.test.cjs:55–156` | Internal secret/principal/role, denied zero ops, loopback default, uncertain timeout, API→Agent flow | Có MOCK_E2E và mock dependencies; provider/DB thật chưa chạy |
| `apps/agent/tests/principal-guards.test.cjs:4,12–42` | System scan zero purchase writes, missing/customer/inactive principal denied, authorized mock operations | Không concurrency/DB authorization thật |
| `apps/agent/tests/rule-based-regression.test.cjs:26,32–51` | Rule-based result, mock Gemini fail→fallback và actor audit | Không gọi provider thật, không xác minh Gemini quality/latency |
| `apps/api/tests/in-process-http.cjs:1–30` | Helper Express request/response không socket | Không phải một test suite độc lập |

## Week 04 và test còn thiếu

| Test/kết quả yêu cầu | Định nghĩa/hiện vật | Trạng thái phiên này | Bằng chứng còn cần |
|---|---|---|---|
| TC-04-01 review | WEEK_04.md mục 5, có expected | NOT RUN; approval UNKNOWN | Biên bản thật, SQL/SRS/ADR có phiên bản, P0 đóng |
| TC-04-02 compile/replay/diff | Có 00/01/02/03 SQL, thiếu harness migration test chuyên biệt trong repository đã quét | NOT RUN | Source fingerprint, DB isolated, full logs/exit code, parity cột/type/FK/index/default/enum |
| TC-04-03 backup/fault/restore | Có rollback plan, thiếu backup/restore test thực | NOT RUN | Backup artifact/hash; inject lỗi cả trước/sau COMMIT, post-snapshot writes; expected/actual theo ID/tiền/tồn/lô/FK; RPO/RTO |
| TC-04-04 ingredient smoke | Chưa tìm API/test Ingredient chuyên biệt | NOT RUN | Role matrix, 401/403 zero writes, validation Decimal/unit, valid CRUD, transaction failure rollback, legacy regression |
| Inventory consistency PostgreSQL | Có mock definitions legacy | NOT RUN | Parallel workers same ingredient/batch, no oversell, reserved invariant, deadlock/retry, idempotency replay |
| Receipt duplicate/race | Chưa thấy test đặc hiệu cho phát hiện SEC03 | NOT RUN | Lặp item trong payload, retry same key, partial receive đồng thời, không vượt ordered |
| Schema drift và SQL syntax | Finding tĩnh DB02–06/MG01–02 VERIFIED | NOT RUN | Parser/replay trên version PostgreSQL đã chốt; không gắn nhãn VERIFIED FAIL cho test chưa chạy |

`SEED_LOG.md:3–11,225–239` là tự ghi lịch sử reset/seed, các đoạn sau có dữ liệu Order/Payment/lô; không có chứng cứ chạy suite hiện hành gắn commit, không phải migration rehearsal 27 bảng. Chưa tìm TAP/JUnit/current execution log trong repository đã quét. Các bài trong docs/WEEK_03/04 cũng ghi test UNKNOWN/G03–G04 NOT EVALUATED; không dùng chúng như pass log độc lập.

## Test nào có thể chạy sau khi gate phù hợp được duyệt

Không chạy npm build/Prisma generate/npm install/test runner trong audit vì có thể sinh artifact, load config hoặc kết nối dịch vụ. `apps/api/package.json` và `apps/agent/package.json` chưa có test script; build là tsc ghi dist. Không gọi npm test theo suy đoán.

Sau khi được phép ở đợt thực hiện riêng, bảy suite CJS có thể là regression ban đầu trong process cô lập với dependencies đã có, Prisma/provider mocked và network ngoài bị chặn. Source dùng transpileModule vào bộ nhớ, không phải typecheck; một số test dùng socket loopback nếu không chọn chế độ in-process. Với hai suite API có nhánh `TEST_IN_PROCESS=1` (`auth-registration:102`, `test-db-security:79`), chọn nhánh đó để tránh socket. Inventory route tests dùng helper in-process trực tiếp. Agent `internal-auth.test.cjs:168` chọn real HTTP khi `TEST_REAL_HTTP=1`; phải review cờ và mock trước chạy, không giả định một biến áp dụng mọi file.

Lệnh dự kiến, **chưa chạy**: `node --test apps/api/tests/inventory-consistency.test.cjs` và tương tự từng tệp đã kiểm tra. Không tự cài dependency thiếu. Lưu stdout/exit code, số case/skipped/fail, commit và hash test/source. Mock pass chỉ đóng tiêu chí mock; không đóng TC-04-02/03.

Sau G01–G05 và ứng viên migration được sửa, chạy integration/rehearsal trong DB test độc lập với dataset deterministic. Không chạy production, không seed/reset DB hiện hữu. Payment provider thật nằm ngoài audit, chỉ dùng mock cho tuần 04; deferred live check không được biến thành PASS hoặc bỏ qua gate contract.

Mỗi execution record phải ghi: run ID, timestamp/timezone, commit và checksum input, PostgreSQL/Prisma/Node version, env target đã che secret, command, fixture, expected/actual, exit code, log, limitations, reviewer. Required checks phải có danh sách đầy đủ và freshness để bảng verification rỗng/NOT_EXECUTED không vượt gate.

# Cleanup Project Structure Log

## 1. Mục tiêu
Dọn dẹp các file lộn xộn, nằm rải rác ngoài thư mục gốc của dự án. Quá trình này không xoá bất kỳ file nào, không can thiệp hay sửa đổi source code, chỉ gom nhóm và phân loại theo chức năng để giữ cho dự án gọn gàng.

## 2. Kết quả scan ban đầu
Khi scan cấu trúc dự án, phát hiện các nhóm file:
1. **Source code chính, Config/build/deploy**: `apps/`, `packages/`, `node_modules/`, `package.json`, `package-lock.json`, `turbo.json`, `README.md`, v.v.
2. **File test case / kết quả test**: Rất nhiều file `.xlsx` (như `CAFE_INV_60_TEST_CASES_UI_LIVE_RESULT.xlsx`), các file `.json` (`results.json`, `tcs.json`...).
3. **Log / Script kỹ thuật (tạm / nháp)**: Các file `.py`, `.js`, `.txt`, file test lẻ (`run_live.js`, `extract_excel.py`, `patch_all.py`...).
4. **Tài liệu báo cáo**: `THONG_TIN_DAU_VAO_CHUONG_3_4_5_CAFE_INV.docx`.
5. **Ảnh chụp màn hình**: Thư mục `screenshots/` nằm ở ngoài cùng.
6. **Thư mục tests**: Chứa kịch bản Playwright automation (`tests/`).

## 3. Thư mục đã tạo
- `docs/reports/`
- `docs/testing/`
- `docs/screenshots/`
- `docs/archive/`
- `docs/agent/`
- `docs/logs/`
- `docs/data/`
- `docs/report-images/`

## 4. File đã di chuyển

| STT | File cũ | File mới (Thư mục chuyển đến) | Lý do di chuyển |
|---|---|---|---|
| 1 | `*.xlsx` (Testing Data/Results) | `docs/testing/` | Gom nhóm các file test case Excel và kết quả kiểm thử. |
| 2 | `*.json` (Testing Results/tcs) | `docs/testing/` | Gom nhóm các kết quả test JSON không thuộc module npm. |
| 3 | `run_live*.js`, `test-agent.ts`, `take_*.mjs` | `docs/testing/` | Các script phục vụ mục đích test và chụp ảnh tự động. |
| 4 | `THONG_TIN_DAU_VAO...docx` | `docs/reports/` | Tài liệu phục vụ báo cáo. |
| 5 | `screenshots/` | `docs/screenshots/` | Di chuyển thư mục ảnh minh hoạ UI ra đúng khu vực docs. |
| 6 | `*.py` (extract, generate, patch...) | `docs/archive/` | Script thao tác nháp, one-off script, script phụ trợ. |
| 7 | `*.js` (patch, extract, append_log) | `docs/archive/` | One-off script, nháp. |
| 8 | `*.txt` (captions, columns, headers) | `docs/archive/` | Dữ liệu text tạm. |
| 9 | `extracted_AdminInventoryPage.tsx` | `docs/archive/` | File extract nháp nằm rải rác ngoài dự án. |

## 5. File giữ nguyên

| STT | File | Lý do giữ nguyên |
|---|---|---|
| 1 | `apps/`, `packages/`, `node_modules/` | Source code và workspace chính của dự án. Không tác động. |
| 2 | `package.json`, `package-lock.json`, `turbo.json` | Cấu hình build & runtime cực kỳ quan trọng, di chuyển sẽ gãy build. |
| 3 | `tests/` | Đây là thư mục test (E2E/UI) của hệ thống (Playwright configs/specs). Di chuyển có thể phá vỡ config `playwright.config.ts` hoặc yêu cầu sửa đổi path trong test case, rủi ro làm gãy build cao. |
| 4 | `.git/`, `.gitignore`, `.idea/`, `.gemini/`, `.npmrc` | Cấu hình IDE, môi trường và version control. |
| 5 | `README.md` | Tài liệu gốc giới thiệu dự án phải nằm ở root. |

## 6. Rủi ro / lưu ý
- Thư mục `tests/` được giữ nguyên ở root vì đó là chuẩn cấu trúc test phổ thông và nó được link trực tiếp với các npm scripts hoặc công cụ test bên trong cấu trúc workspace.
- Các file JSON được loại trừ triệt để đối với `package.json`, `package-lock.json` và `turbo.json` khi di chuyển để đảm bảo NPM Workspace (`-w`) vẫn hoạt động.

## 7. Kiểm tra sau khi dọn
- Lệnh: `npm run build -w @cafe-project/web` -> **Kết quả**: Thành công (`✓ built in 2.67s`).
- Lệnh: `npm run build -w @cafe-project/api` -> **Kết quả**: Thành công.
Dự án hoàn toàn ổn định và build tốt sau khi dọn dẹp.

## 8. Dọn file phát sinh sau lần cleanup trước

### 8.1. File log đã tham chiếu
* docs/CLEANUP_PROJECT_STRUCTURE_LOG.md
* docs/FRONTEND_BACKEND_INTEGRATION_LOG.md

### 8.2. Kết quả scan mới
Phát hiện các file log kỹ thuật mới trong `docs/`, các script nháp (`.py`, `.js`) và script test API/Agent ở root dự án chưa được phân loại.

### 8.3. File đã di chuyển
| STT | File cũ | File mới | Lý do |
| --- | --- | --- | --- |
| 1 | `api_response.json` | `docs/testing/api_response.json` | Chuyển file kết quả test vào đúng thư mục testing. |
| 2 | `patch.py`, `replace_ui.js` | `docs/archive/` | Script patch nháp, dùng một lần. |
| 3 | `reproduce.js`, `run_scan.js`, `test_api.js`, `test_logs.js`, `test_mojibake.js`, `test_scan.js` | `tools/test-live/` | Các script dùng để test live API và Agent service. |
| 4 | `docs/*_LOG.md` | `docs/logs/` | Gom nhóm các file log scan kỹ thuật vào thư mục logs. |
| 5 | `docs/append_log*.txt`, `docs/temp_append*.md`, `docs/hihi.txt` | `docs/archive/` | Dọn các file nháp tạm thời vào archive. |

### 8.4. File giữ nguyên
| STT | File | Lý do giữ nguyên |
| --- | --- | --- |
| 1 | `docs/CLEANUP_PROJECT_STRUCTURE_LOG.md` | Log theo dõi dọn dẹp chính. |
| 2 | `docs/FRONTEND_BACKEND_INTEGRATION_LOG.md` | Log tích hợp, tài liệu tham chiếu quan trọng. |
| 3 | `tests/` | Chứa kịch bản E2E Playwright. |

### 8.5. File/thư mục đã thêm vào .gitignore
| STT | Pattern | Lý do |
| --- | --- | --- |
| 1 | Xóa `docs/` và `tests/` khỏi gitignore | Cho phép commit tài liệu, báo cáo, test case. |
| 2 | `playwright/.auth/`, `playwright-videos/` | Bỏ qua các file state và video tự động sinh của Playwright. |
| 3 | `docs/archive/*.txt`, `*.py`, `*.js` | Bỏ qua các script nháp trong archive. |

### 8.6. File liên quan frontend/backend/agent
| STT | File | Vai trò | Cách xử lý |
| --- | --- | --- | --- |
| 1 | `test_api.js`, `test_scan.js`, `reproduce.js` | Test live API và luồng tích hợp agent | Đưa vào `tools/test-live/` |
| 2 | `FRONTEND_BACKEND_INTEGRATION_LOG.md` | Lưu trữ các log fix lỗi tích hợp | Giữ nguyên tại `docs/` và cập nhật thông tin |

### 8.7. File cần kiểm tra thủ công
| STT | File | Lý do chưa xử lý |
| --- | --- | --- |
| 1 | `docs/git-temp/` | Thư mục backup git, cần giữ để tránh mất thay đổi khi revert. |

### 8.8. Kết quả kiểm tra sau khi dọn
- Lệnh: `npm run build -w @cafe-project/web` -> Thành công.
- Lệnh: `npm run build -w @cafe-project/api` -> Thành công.
- Lệnh: `npm run build -w @cafe-project/agent` -> Thành công.
- Lệnh: `npx playwright test --list` -> Thành công liệt kê các test.

## 10. Chuẩn hoá thư mục output test/playwright
- tests/ giữ nguyên ở root vì đây là Playwright test source chính.
- tools/ giữ nguyên ở root vì đây là script/tool chạy thật.
- test-results/ chuyển output sang docs/testing/test-results/.
- playwright/.auth/ được ignore.
- scratch/ chuyển vào docs/archive/scratch/.
- output script phải ghi vào docs/.

## 11. Chuyển toàn bộ Playwright vào tests/
- Playwright config đã chuyển về tests/playwright/playwright.config.ts.
- Playwright helper/fixture/auth runtime nằm trong tests/playwright/.
- Playwright specs vẫn nằm trong tests/ui-live-cafe-inventory-agent/tests/.
- Output test vẫn ghi về docs/testing/test-results/.
- HTML report vẫn ghi về docs/testing/playwright-report/.
- Không còn thư mục playwright/, test-results/, playwright-report/ rải rác ở root.
- Các script npm đã được cập nhật để gọi đúng config mới.
- Các file auth/session được ignore để tránh commit dữ liệu nhạy cảm.

## 12. Chuyển tests/ và tools/ vào docs/automation/

### 12.1. Mục tiêu
Dọn gọn root dự án bằng cách chuyển test automation và tool script vào docs/automation/, không xoá file và không làm ảnh hưởng build/test.

### 12.2. Thư mục đã di chuyển
| STT | Vị trí cũ | Vị trí mới | Lý do |
|---|---|---|---|
| 1 | tests/ | docs/automation/tests/ | Gom toàn bộ test automation vào docs/automation. |
| 2 | tools/ | docs/automation/tools/ | Gom script/tool test live vào docs/automation. |

### 12.3. Đường dẫn đã cập nhật
Ghi rõ:
- Playwright config mới: docs/automation/tests/playwright/playwright.config.ts
- Playwright specs mới: docs/automation/tests/ui-live-cafe-inventory-agent/tests/
- Tool test live mới: docs/automation/tools/test-live/
- Output test: docs/testing/test-results/
- HTML report: docs/testing/playwright-report/

### 12.4. File đã sửa
Liệt kê các file đã sửa:
- package.json
- .gitignore
- docs/automation/tests/playwright/playwright.config.ts
- các script trong docs/automation/tools/test-live/

### 12.5. Kết quả kiểm tra
- npm run build -w @cafe-project/web: Thành công
- npm run build -w @cafe-project/api: Thành công
- npm run build -w @cafe-project/agent: Thành công
- npx playwright test -c docs/automation/tests/playwright/playwright.config.ts --list: Thành công
- npm run test:ui-live:list: Thành công

## 14. D?n automation cu kh?i Cafe Project sau khi t�ch project ri�ng

- �� t�ch Automation E2E sang project ri�ng b�n ngo�i.
- Cafe Project ch? gi? source nghi?p v?, docker/deploy v� t�i li?u log quan tr?ng.
- �� xo� automation cu trong docs/automation.
- �� xo� output/report/screenshot cu kh?i docs.
- �� xo� script test:ui-live* kh?i package.json.
- Kh�ng xo� apps/, packages/, docker, README, log t�ch h?p.


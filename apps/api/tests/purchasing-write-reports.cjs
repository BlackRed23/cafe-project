// Read-only report generator for NH acceptance. Source of truth: real HTTP
// evidence, actual PostgreSQL records, backend test/build logs.
// Outputs only the three requested Markdown reports, outside repository.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });

const root = 'D:/KLTN/cafe-project-artifacts/reports/purchasing';
const at = name => path.join(root, name);
const read = name => JSON.parse(fs.readFileSync(at(name), 'utf8'));
const ext = name => JSON.parse(fs.readFileSync(name, 'utf8'));
const log = name => {
  const b = fs.readFileSync(at(name));
  return b[0] === 255 && b[1] === 254 ? b.toString('utf16le') : b.toString('utf8');
};
const write = (name, body) => fs.writeFileSync(at(name), body.join('\n') + '\n', 'utf8');
const q = value => '`' + String(value ?? '').replaceAll('`', '') + '`';
const cell = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const verified = rows => rows.every(x => x.verdict === 'PASS');
const expectations = [
  ['NH-01', 'Tạo Purchase Request với nguyên liệu, lượng, người đề nghị; PENDING; không tăng kho'],
  ['NH-02', 'ADMIN duyệt yêu cầu với người duyệt, thời gian; không tự tạo PO'],
  ['NH-03', 'ADMIN từ chối yêu cầu với lý do và audit; không phát sinh PO/tồn kho'],
  ['NH-04', 'Lập PO từ PR duyệt, Snapshot Supplier/đơn giá/quy cách; chặn PO đang xử lý trùng'],
  ['NH-05', 'Gửi PO có chứng cứ dispatch; không suy diễn đã giao email thành công'],
  ['NH-06', 'Xử lý kết quả gửi không rõ, thử lại không tạo thêm PO, giữ từng dispatch attempt'],
  ['NH-07', 'Xác nhận PO có nguồn, người, thời gian; không tăng kho chỉ vì xác nhận'],
  ['NH-08', 'Từ chối PO có lý do, giữ PO cũ; chọn Supplier thay thế, tạo PO mới'],
  ['NH-09', 'Nhận đủ hàng theo lô; GoodsReceipt + IngredientBatch + IMPORT đúng một lần'],
  ['NH-10', 'Nhận thiếu, giữ lượng chưa nhận; nhận tiếp trên cùng PO'],
  ['NH-11', 'Phát hiện giao thừa; không vượt số được duyệt; lưu lượng quan sát/nhận/từ chối'],
  ['NH-12', 'Phát hiện sai nguyên liệu; từ chối thay thế và không import sai'],
  ['NH-13', 'Ghi bằng chứng hàng hỏng; giữ/từ chối trước nhập; không tăng kho khả dụng'],
  ['NH-14', 'Phân loại hạn dùng và từ chối lô hết hạn; không tự đặt chính sách hạn dùng tối thiểu'],
  ['NH-15', 'Nhiều chuyến nhận trên một PO, mỗi GoodsReceipt độc lập và có lịch sử'],
  ['NH-16', 'Hai xác nhận nhận hàng HTTP đồng thời chờ khóa DB, không nhận vượt, replay an toàn'],
  ['NH-17', 'Hủy PO chưa nhận, giữ audit và chặn nhập sau khi hủy'],
  ['NH-18', 'Đơn nhận một phần giữ hàng đã nhập, yêu cầu hủy phần còn lại đúng quyền/chính sách'],
  ['NH-19', 'Trả hàng liên kết receipt/lô/Supplier/PO, RETURN_OUT một lần, công nợ chưa tất toán'],
  ['NH-20', 'Đối soát invoice khác PO, giữ snapshot giá PO, chặn coi là đã thanh toán'],
  ['NH-21', 'Nhiều yêu cầu từ cùng nguồn thiếu hàng tạo PR duy nhất bằng khóa và idempotency'],
  ['NH-22', 'Không có Supplier: PR PENDING chờ bổ sung, ADMIN chọn Supplier thật rồi duyệt']
];
const externalNotVerified = new Set(['NH-05','NH-06','NH-07','NH-08']);
const policyBlocked = new Set(['NH-11','NH-14','NH-18','NH-21']);
const classification = id => externalNotVerified.has(id) ? 'NOT_VERIFIED' :
  policyBlocked.has(id) ? 'BLOCKED_POLICY' : 'PASS';
const problems = [
  ['D-01','NH-04','Không có thực thể PO độc lập; PR đồng thời là nơi nhận hàng',
    'Bổ sung PurchaseOrder, PurchaseOrderItem snapshot Supplier/đơn giá/đơn vị, tham chiếu PR', 'purchase.prisma; purchase-order.service.ts'],
  ['D-02','NH-01/21','Nguồn thiếu hàng không có khóa/identity ở đồng thời',
    'demandSourceKey + SHA-256, advisory transaction lock và replay theo actor', 'purchase.repository.ts; purchase.service.ts'],
  ['D-03','NH-02','Chuyển trạng thái duyệt cũ không có điều kiện cạnh tranh và replay',
    'Conditional updateMany PENDING→APPROVED với approvedBy/At; replay cùng actor', 'purchase.service.ts'],
  ['D-04','NH-03','Từ chối PR chưa giới hạn PENDING, ghi đè notes thay vì audit riêng',
    'Giới hạn PENDING và ghi rejectedById, rejectedAt, rejectionReason', 'purchase.service.ts; purchase.prisma'],
  ['D-05','NH-05/06','Lệnh mark-sent thủ công có thể tự tạo bằng chứng đã gửi',
    'Chặn shortcut; dispatch test-only giữ attempt, UNKNOWN và không gửi nhà cung cấp thật',
    'purchase.service.ts; purchase-order.service.ts'],
  ['D-06','NH-08/22','Supplier không đủ điều kiện/không có không có đường giữ PR chờ sửa',
    'PENDING sourcing hold với supplierId=NULL, chọn Supplier được kiểm tra; không tạo Supplier giả',
    'purchase.prisma; purchase-order.service.ts; supplier.prisma'],
  ['D-07','NH-09/10/16','Số đã nhận đọc từ request trước khi lock nên có nguy cơ nhận quá',
    'Row lock PurchaseRequest, đọc lại quantityReceived trong transaction, cập nhật PO item atomically',
    'purchase.repository.ts'],
  ['D-08','NH-16','Receipt idempotencyKey không gắn hash payload/actor; replay khác dữ liệu có thể đi qua',
    'requestHash theo PO/receipt/items + receivedBy; trùng key khác payload/actor trả 409',
    'purchase.repository.ts; purchase.service.ts; purchase.prisma'],
  ['D-09','NH-11/12/13/14','Không có bằng chứng sai lệch giao hàng riêng; nguy cơ tự nhận hàng không phù hợp',
    'PurchaseDeliveryDiscrepancy với category, quantities, evidence, actor và HELD',
    'purchase-order.service.ts; purchase.prisma'],
  ['D-10','NH-06/17/18','Hủy PR/PO cũ không phân biệt phần đã gửi/đã nhận với phần chưa nhận',
    'CANCELLED chỉ cho CREATED; PO đã dispatch/confirm/partial chuyển CANCELLATION_PENDING giữ kiểm tra chính sách',
    'purchase-order.service.ts'],
  ['D-11','NH-19','Thiếu supplier return liên kết receipt/lô, không bảo vệ reserved',
    'Nguồn IMPORT, trừ batch và ingredient, RETURN_OUT âm, nguồn và credit UNSETTLED, lock/idempotency',
    'purchase-order.service.ts; inventory.prisma'],
  ['D-12','NH-20','Thiếu đối soát hóa đơn riêng, giá nhận hàng có thể sửa snapshot PR',
    'Lưu invoice và differences, không đổi giá gốc và không tự phê duyệt thanh toán',
    'purchase.repository.ts; purchase-order.service.ts'],
  ['D-13','NH-19/KK','Bộ đối soát Stocktake chưa nhận diện RETURN_OUT vật lý',
    'Bổ sung RETURN_OUT vào tập chuyển động vật lý, kiểm thử KK/return cùng lô',
    'stocktake.service.ts'],
  ['D-14','NH-22','Những nơi hiển thị/soạn email mặc định Supplier luôn tồn tại',
    'Kiểm tra nullable Supplier ở purchase, email và dashboard; giữ trạng thái chờ',
    'purchase.service.ts; email.service.ts; dashboard.service.ts'],
  ['D-15','Regression','Test repository inject dependencies cũ không cấp node:crypto',
    'Điều chỉnh đúng mock dependency để thử lỗi duplicate trước transaction',
    'purchase-receipt-validation.test.cjs'],
  ['D-16','NH-09/16','Thiếu fault-injection regression chứng minh rollback sau khi đã ghi một phần',
    'Bộ fault-only :5005, hai lỗi sau IMPORT và PO FINAL STATUS, kiểm tra DB trước/sau',
    'purchasing-fault-server.cjs; purchasing-nh-fault.cafedb.cjs'],
  ['D-17','NH-09','Legacy PATCH receive vẫn có thể nhận trực tiếp khi PurchaseRequest đã có PO',
    'Chặn receipt thiếu purchaseOrderId khi PR đã có PO, giữ lối cũ chỉ cho PR legacy không có PO',
    'purchase.repository.ts; purchasing-nh-http.cafedb.cjs']
];

async function main() {
  const nh = read('PURCHASING-HTTP-DB-EVIDENCE.json');
  const fault = read('PURCHASING-FAULT-EVIDENCE.json');
  const nl = read('PURCHASING-NL-REGRESSION.json');
  const tk = read('INVENTORY-HTTP-DB-EVIDENCE.json');
  const kk = read('STOCKTAKE-HTTP-DB-EVIDENCE.json');
  const lo = ext('D:/KLTN/cafe-project-artifacts/reports/lot/lot-evidence.json')
    .runs.filter(x=>x.phase==='purchasing-regression').at(-1);
  const bh = ext('D:/KLTN/cafe-project-artifacts/reports/sales/purchasing-bh-regression.json').runs.at(-1);
  const tests = log('purchasing-backend-tests.log');
  const build = log('purchasing-api-build.log');
  const backendPass = /tests\s+198/.test(tests) && /pass\s+198/.test(tests) && /fail\s+0/.test(tests);
  const buildPass = /tsc/.test(build) && !/error TS\d+/.test(build);
  const cases = new Map(nh.scenarios.map(s=>[s.id,s]));
  assert.equal(nh.scenarios.length, 22, 'Missing NH cases');
  assert.ok(expectations.every(([id])=>cases.get(id)?.verdict==='PASS'), 'Backend NH evidence FAIL/MISSING');
  assert.equal(fault.scenarios.length, 2);
  assert.ok(verified(fault.scenarios), 'Fault rollback not proven');
  assert.ok(verified(nl.scenarios) && verified(tk.scenarios) && verified(kk.scenarios) &&
    verified(lo.scenarios) && verified(bh.scenarios) && lo.regressions.every(x=>x.verdict==='PASS'),
    'Real HTTP regression not verified');
  assert.ok(backendPass && buildPass, 'Build/backend regression not verified');

  const u = new URL(process.env.DATABASE_URL);
  assert.equal(u.pathname, '/cafedb', 'Unexpected DATABASE_URL target');
  u.hostname='127.0.0.1'; u.port='55432';
  const db = new PrismaClient({ datasources: { db: { url: u.toString() } } });
  let check, detail = [];
  try {
    [check] = await db.$queryRawUnsafe(`SELECT current_database() AS database,
      (SELECT count(*)::int FROM "_prisma_migrations"
        WHERE migration_name='20261118221000_purchasing_order_traceability'
        AND finished_at IS NOT NULL) AS applied,
      (SELECT count(*)::int FROM pg_trigger
        WHERE tgname='InventoryTransaction_stocktake_cursor' AND NOT tgisinternal) AS cursor_trigger`);
    assert.equal(check.database,'cafedb');assert.equal(check.applied,1);assert.equal(check.cursor_trigger,1);
    for (const [id, expected] of expectations) {
      const s = cases.get(id), a = s.actual ?? {};
      let prId = a.purchaseRequestId ?? a.requestId ?? a.id;
      const poId = a.orderId ?? a.newOrderId ?? a.purchaseOrderId;
      let po = poId ? await db.purchaseOrder.findUnique({where:{id:poId}}) : null;
      if (po) prId = po.purchaseRequestId;
      const pr = prId ? await db.purchaseRequest.findUnique({where:{id:prId},
        include:{items:true,receipts:true,purchaseOrders:{include:{items:true,receipts:true}}}}) : null;
      assert.ok(pr,'Missing persisted PurchaseRequest for '+id);
      const ids = [...new Set(pr.items.map(i=>i.ingredientId).filter(Boolean))];
      const ingredient = ids.length ? await db.ingredient.findMany({where:{id:{in:ids}},
        select:{id:true,quantity:true}}) : [];
      const ledger = ids.length ? await db.inventoryTransaction.groupBy({
        by:['type'],where:{ingredientId:{in:ids},type:{in:['IMPORT','RETURN_OUT','ADJUSTMENT']}},
        _count:{_all:true}
      }) : [];
      const qty = ingredient.reduce((n,i)=>n+Number(i.quantity),0);
      const itemQty = pr.items.reduce((n,i)=>n+i.quantityReceived,0);
      const ordered = pr.items.reduce((n,i)=>n+i.quantity,0);
      const events = s.evidence.map(ref=>nh.requests.find(x=>x.id===ref)).filter(Boolean);
      assert.equal(events.length,s.evidence.length,'Missing evidence rows for '+id);
      const routes = [...new Set(events.map(r =>
        r.method+' '+r.url+' ['+(r.status === null ? 'ABORT' : r.status)+']'))];
      const dbSummary = 'PR '+pr.status+'; PO '+(pr.purchaseOrders.map(x=>x.status).join(',')||'không có')+
        '; đã nhận '+itemQty+'/'+ordered+'; GR '+pr.receipts.length+
        '; tồn fixture '+qty+'; ledger '+(ledger.map(x=>x.type+':'+x._count._all).join(',')||'0');
      detail.push({id,expected,caseStatus:classification(id),backend:s.verdict,
        ids:s.evidence,actual:s.actual,db:dbSummary,routes,prId:pr.id});
    }
  } finally { await db.$disconnect(); }

  const completed = detail.filter(x=>x.caseStatus==='PASS').length;
  const blocked = detail.filter(x=>x.caseStatus==='BLOCKED_POLICY').length;
  const unverified = detail.filter(x=>x.caseStatus==='NOT_VERIFIED').length;
  const totalEvents = nh.requests.length+fault.requests.length+nl.requests.length+
    lo.requests.length+bh.requests.length+tk.requests.length+kk.requests.length;
  const generatedAt = new Date().toISOString();
  const matrix = detail.map(s=>[
    '| '+s.id, cell(s.expected), cell(s.routes.join('; ')),
    cell(s.db), cell((s.ids??[]).join(', ')),
    'Backend '+s.backend+' / **'+s.caseStatus+'** |'
  ].join(' | '));

  write('PURCHASING-API-VERIFICATION.md',[
    '# NGHIỆM THU API MUA HÀNG NH-01..NH-22',
    '',
    '**Ngày tổng hợp:** '+generatedAt,
    '**Repository:** '+q('D:\\KLTN\\source\\cafe-project')+' · Git branch '+q('dateduy'),
    '**Database:** '+q('cafedb')+' qua '+q('127.0.0.1:55432')+' · Migration '+q('20261118221000_purchasing_order_traceability')+' applied: '+check.applied,
    '',
    '## Kết luận',
    '',
    '**FULL_NH_ACCEPTANCE = PARTIAL.** 22/22 kịch bản kiểm thử Backend HTTP/JWT/Prisma/PostgreSQL đều PASS; '
      +completed+'/22 đạt đủ tiêu chí cuối; '+blocked+' BLOCKED_POLICY; '+unverified+' NOT_VERIFIED ở bên thứ ba.',
    'Không có lỗi kiểm thử Backend còn mở trong bộ kiểm thử NH đã chạy. Đây **không** phải xác nhận email đã tới Supplier hay Supplier thật đã xác nhận.',
    '',
    '## Ma trận nghiệm thu (trạng thái kết luận, không đánh đồng Backend PASS với thực tế bên ngoài)',
    '',
    '| Mã | Nghiệp vụ kỳ vọng | HTTP thật: method, route, status | PostgreSQL sau kiểm thử (fixture riêng) | HTTP evidence IDs | Đánh giá |',
    '|---|---|---|---|---|---|',
    ...matrix,
    '',
    '**Đối chiếu trước/sau:** nguyên liệu fixture mới được tạo với tồn = 0; cột PostgreSQL thể hiện trạng thái cuối được truy vấn lại từ '+q('cafedb')+
    '. Lượng nhập, trạng thái PO/PR, lô và ledger được assert theo từng ca trong '+q('purchasing-nh-http.cafedb.cjs')+
    '. Phép thử rollback ghi snapshot DB chi tiết trước/sau trong '+q('PURCHASING-FAULT-EVIDENCE.json')+'.',
    '',
    '## Kiểm thử đồng thời, retry, rollback',
    '',
    '- NH-16: có 2 PostgreSQL waiter thật trên PurchaseRequest; hai POST cạnh tranh trả 201 và 409, chỉ một GoodsReceipt/IMPORT; thử lại cùng requestId trả replay.',
    '- NH-19: hai yêu cầu RETURN_OUT cạnh tranh chờ khóa; chỉ một thao tác trong hai được duyệt, batch + Ingredient trừ thống nhất, credit = UNSETTLED. KK liên quan xác nhận không điều chỉnh trùng.',
    '- NH-21: hai đề xuất từ cùng nguồn thực sự chờ advisory lock; tạo duy nhất một PR và replay cùng nội dung; payload thay đổi trả 409.',
    '- NH-ROLLBACK-LEDGER và NH-ROLLBACK-PO-FINALIZE: fault-only HTTP server :5005 chèn lỗi sau lệnh ghi trong transaction. Cả 2/2 PASS: không tồn tại thay đổi một phần ở PR, PO, receipt, batch, ledger hay cursor.',
    '',
    '## Phân loại đúng bằng chứng nhà cung cấp và chính sách',
    '',
    '- NH-05/06: chỉ ghi audit '+q('NO_NETWORK_TEST_ONLY')+', trạng thái SANDBOX_SENT/DISPATCH_UNKNOWN. Không gọi SMTP/Provider, không có thông tin delivered/received thật: **NOT_VERIFIED**.',
    '- NH-07/08: nguồn xác nhận/từ chối là ADMIN_ATTESTATION; không có chữ ký/callback độc lập từ Supplier. Backend kiểm tra actor và stale/duplicate; đối với Supplier thật: **NOT_VERIFIED**.',
    '- NH-11: ghi chênh lệch, chặn nhập vượt định mức và giữ phần không chấp nhận; chính sách cho phép nhận vượt/tolerance chưa duyệt: **BLOCKED_POLICY** ở nhánh chấp nhận excess.',
    '- NH-14: hạn dùng quá khứ bị từ chối; ngưỡng hạn dùng tối thiểu khi nhận hàng chưa được duyệt: **BLOCKED_POLICY**.',
    '- NH-18: hàng 3/10 đã nhập giữ nguyên; 7/10 chờ xử lý. PO '+q('CANCELLATION_PENDING')+
      ', không hủy vĩnh viễn cam kết đã xác nhận/nhận một phần: **BLOCKED_POLICY**.',
    '- NH-21: tạo trùng từ **cùng nguồn** đã được khóa và deduplicate. Nhưng hai nguồn thiếu hàng **độc lập** cùng nguyên liệu hiện bị gate active PR cũ từ chối mà chưa có quy trình giữ và hợp nhất có phê duyệt: **BLOCKED_POLICY** ở nhánh consolidation.',
    '- NH-19: công nợ SupplierReturn UNSETTLED; không xác nhận nhà cung cấp đã hoàn tiền.',
    '- NH-20: hóa đơn lệch được ghi DISPUTED; không tự sửa giá PO và không phê duyệt thanh toán.',
    '',
    '## Hồi quy',
    '',
    '| Bộ kiểm tra | Kết quả | Số HTTP events | Nguồn bằng chứng |',
    '|---|---|---:|---|',
    '| NH Backend | 22/22 PASS | '+nh.requests.length+' | PURCHASING-HTTP-DB-EVIDENCE.json |',
    '| NH fault rollback | 2/2 PASS | '+fault.requests.length+' | PURCHASING-FAULT-EVIDENCE.json |',
    '| NL real HTTP | '+nl.scenarios.filter(x=>x.verdict==='PASS').length+'/'+nl.scenarios.length+' PASS | '+nl.requests.length+' | PURCHASING-NL-REGRESSION.json |',
    '| LO real HTTP | '+lo.scenarios.filter(x=>x.verdict==='PASS').length+'/'+lo.scenarios.length+' PASS, supplementary '+lo.regressions.map(x=>x.verdict).join(',')+' | '+lo.requests.length+' | ../lot/lot-evidence.json phase purchasing-regression |',
    '| BH real HTTP | '+bh.scenarios.filter(x=>x.verdict==='PASS').length+'/'+bh.scenarios.length+' PASS | '+bh.requests.length+' | ../sales/purchasing-bh-regression.json |',
    '| TK real HTTP | '+tk.scenarios.filter(x=>x.verdict==='PASS').length+'/'+tk.scenarios.length+' PASS | '+tk.requests.length+' | INVENTORY-HTTP-DB-EVIDENCE.json |',
    '| KK real HTTP | '+kk.scenarios.filter(x=>x.verdict==='PASS').length+'/'+kk.scenarios.length+' PASS | '+kk.requests.length+' | STOCKTAKE-HTTP-DB-EVIDENCE.json |',
    '| Backend tests | 198/198 PASS | - | purchasing-backend-tests.log |',
    '| API build | PASS (tsc) | - | purchasing-api-build.log |',
    '',
    '**Tổng cộng '+totalEvents+' HTTP events** (gồm phản hồi lỗi có chủ đích). Unit/mock tests 198 không được tính là HTTP thực.',
    'Bằng chứng fixture tạo riêng, có tiền tố '+q(nh.run)+'; không reset/truncate DB, không sửa ledger lịch sử và không gửi đơn hàng/email thật.',
    '',
    '## Giới hạn',
    '',
    '- CCE_STATUS = CCE_UNAVAILABLE: khám phá bằng CoS đọc source có chọn lọc.',
    '- Nhánh Invoice đúng số lượng và price + nghiệm thu khoản thanh toán nhà cung cấp ngoài phạm vi đã kiểm chứng. Đối soát lệch thì đã chứng minh.',
    '- Kho Legacy '+q('Inventory/InventoryBatch')+' không chuyển đổi; PO mới chỉ hỗ trợ nguyên liệu, nhánh PR legacy giữ tương thích.',
    '- Hành động phát sinh qua Agent không được cấp quyền bypass ADMIN; không thay đổi Agent code.',
    ''
  ]);

  const defectRows = problems.map(([id,scope,initial,fix,paths])=>
    '| '+id+' | '+scope+' | '+cell(initial)+' | '+cell(fix)+' | '+cell(paths)+' | CLOSED / backend retest PASS |');
  write('PURCHASING-DEFECT-LOG.md',[
    '# PURCHASING — LOG LỖI VÀ KHOẢNG TRỐNG NGHIỆP VỤ',
    '',
    'Tổng hợp: '+generatedAt,
    '**'+problems.length+' khoảng trống/căn nguyên code hoặc thiếu kiểm chứng được xử lý; 0 test defect còn mở trong NH Backend.** '
      +'Đây là phát hiện từ việc đối chiếu mã và kiểm thử, không phải khẳng định có '+problems.length+' sự cố đã xảy ra trong production.',
    '',
    '| ID | NH ảnh hưởng | Căn nguyên trước thay đổi | Sửa đổi tối thiểu | File liên quan | Trạng thái |',
    '|---|---|---|---|---|---|',
    ...defectRows,
    '',
    '## Các trở ngại chưa thể tự đóng bằng code',
    '',
    '| ID | Phạm vi | Trạng thái | Quyết định/evidence còn thiếu |',
    '|---|---|---|---|',
    '| P-01 | NH-11 giao vượt | BLOCKED_POLICY | Tolerance và vai trò chấp nhận số vượt |',
    '| P-02 | NH-14 hạn dùng tối thiểu | BLOCKED_POLICY | Hợp đồng/hướng dẫn quy định threshold còn lại |',
    '| P-03 | NH-18 hủy PO đã xác nhận/nhận một phần | BLOCKED_POLICY | Quy trình làm việc với Supplier, trách nhiệm và chứng từ kết thúc cam kết |',
    '| P-04 | NH-21 hợp nhất nhiều nguồn thiếu hàng độc lập | BLOCKED_POLICY | Quy tắc giữ/hợp nhất yêu cầu và quyền phê duyệt, giữ nguyên danh tính người đề xuất |',
    '| E-01 | NH-05/06 gửi và gửi lại | NOT_VERIFIED | Test provider/sandbox đáng tin cậy, provider message ID và delivered evidence |',
    '| E-02 | NH-07/08 Supplier confirm/reject | NOT_VERIFIED | Callback có ký hoặc chứng từ thật xác minh độc lập từ Supplier |',
    '',
    '## Các vấn đề phát hiện trong kiểm thử và cách xử lý',
    '',
    '- NH-02: approve idempotency cần kiểm tra trạng thái trước khi yêu cầu PENDING, xử lý lại cùng ADMIN không bị false failure.',
    '- NH-21: phép đo khóa lần đầu không phát hiện waiter do PostgreSQL prepared query hiển thị tham số $1, không hiện chuỗi demand; đổi điều kiện pg_stat_activity sang tên hàm và kéo dài timeout interactive tx. Test lại 2 waiter PASS.',
    '- Backend test purchase-receipt-validation.test.cjs thiếu dependency '+q('node:crypto')+
      ' cho repository mới; test 198/198 PASS sau khi cập nhật mock đúng.',
    '- Nhánh nhận hàng phải lấy quantityReceived mới nhất trong transaction và không sửa unitPrice của PR khi invoice lệch.',
    '- NH-19 vật lý RETURN_OUT phải tham gia stocktake reconcilation; kiểm thử đã xác nhận variance = 0.',
    '- NH-18 không giả định chỉ có chứng từ/ý kiến là đủ cho quyền hủy cam kết đã xác nhận; giữ trạng thái cần đánh giá chính sách.',
    '- NH-21 chặn tạo trùng cùng nguồn có khóa PostgreSQL; yêu cầu riêng biệt cùng nguyên liệu không được merge lén, nhưng quy trình consolidation vẫn chờ chính sách.',
    '',
    '## Bảo toàn',
    '',
    '- Git branch '+q('dateduy')+' đang có thay đổi chưa commit từ các module khác. Không reset/clean/stage/commit/push.',
    '- Migration additive duy nhất trong nghiệp vụ NH: '+q('20261118221000_purchasing_order_traceability')+'. Không xóa bảng/lịch sử.',
    '- Không gửi SMTP hoặc thực hiện giao dịch tài chính ngoài. Hợp đồng tiếp nhận thực tế với Supplier NOT_VERIFIED.',
    '- Nguồn fixture NH được lưu lại để truy vết; không làm sạch phá hủy trên cafedb.',
    ''
  ]);

  const routes = [
    ['POST','/api/purchase-requests','ADMIN','supplierId, items[ingredientId/inventoryId, quantity, unitPrice], demandSourceKey?','201; 400/409','Tạo PR PENDING, lưu demandHash; không tạo PO/stock'],
    ['PATCH','/api/purchase-requests/:id/approve','ADMIN','Path id','200; 400/403/409','PENDING→APPROVED, approvedBy/At; replay cùng ADMIN'],
    ['PATCH','/api/purchase-requests/:id/reject','ADMIN','{reason}','200; 400/409','PENDING→REJECTED, actor/reason/time; không đổi kho'],
    ['PATCH','/api/purchase-requests/:id/mark-sent','ADMIN','Path id','409 nếu thiếu emailSentAt','Không thể tự gắn SENT khi không có chứng cứ adapter'],
    ['POST','/api/purchase-requests/sourcing-holds','ADMIN/STAFF','{requestId,ingredientId,quantity,reason,demandSourceKey?}','201; 409','Tạo PR PENDING không có Supplier khi thiếu nguồn cung hợp lệ'],
    ['GET','/api/purchase-requests/ingredients/:ingredientId/eligible-suppliers','ADMIN','Path ingredientId','200','Đọc Supplier ACTIVE có quy cách nguyên liệu hợp lệ'],
    ['POST','/api/purchase-requests/:id/assign-supplier','ADMIN','{requestId,supplierId,reason}','200; 409','Chọn nhà cung cấp cho PR đang sourcing hold; chưa duyệt'],
    ['POST','/api/purchase-requests/:id/select-supplier','ADMIN','{requestId,supplierId,reason}','200; 409','Đổi Supplier sau PO cũ REJECTED/CANCELLED với cùng snapshot giá'],
    ['POST','/api/purchase-orders','ADMIN','{requestId,purchaseRequestId,currency:VND}','201; 403/409','Tạo PO mới từ PR APPROVED; snapshot đơn giá/quy cách'],
    ['GET','/api/purchase-orders/:id','ADMIN','Path PO id','200; 404','Đọc PO, items, event, receipt, invoice, discrepancy, return'],
    ['POST','/api/purchase-orders/:id/dispatch','ADMIN','{requestId,mode:SANDBOX|UNKNOWN,reason}','200; 409','Chỉ log dispatch test; externalDelivery NOT_VERIFIED'],
    ['POST','/api/purchase-orders/:id/confirm','ADMIN','{requestId,reason,evidenceReference}','200; 403/409','Ghi ADMIN_ATTESTATION, không xác thực độc lập Supplier'],
    ['POST','/api/purchase-orders/:id/reject','ADMIN','{requestId,reason,evidenceReference}','200; 409','Lưu từ chối thủ công và giữ PO cũ'],
    ['POST','/api/purchase-orders/:id/cancel','ADMIN','{requestId,reason,supplierEvidenceReference?}','200/409','CANCELLED chỉ khi chưa xác nhận/nhận; chặn nhánh ảnh hưởng cam kết'],
    ['POST','/api/purchase-orders/:id/request-cancel','ADMIN','{requestId,reason,supplierEvidenceReference?}','200; 409','CONFIRMED/PARTIALLY_RECEIVED→CANCELLATION_PENDING, BLOCKED_POLICY'],
    ['POST','/api/purchase-orders/:id/receipts','ADMIN/STAFF','{requestId,supplierInvoiceNo?,note?,items:[purchaseOrderItemId,receivedQuantity,batches[batchCode,expirationDate,quantity]]}','201; 400/409','Gắn GoodsReceipt với PO; IMPORT theo lot; không nhận quá; replay'],
    ['POST','/api/purchase-orders/:id/discrepancies','ADMIN/STAFF','{requestId,purchaseOrderItemId,category,observedIngredientId?,observedQuantity,acceptedQuantity,rejectedQuantity,reason,evidence?}','201; 409','HELD chứng cứ sai lệch; không tự sửa stock'],
    ['POST','/api/purchase-orders/:id/returns','ADMIN','{requestId,goodsReceiptId,batchId,quantity,reason}','201; 403/409','Source-linked RETURN_OUT âm, cập nhật batch/Ingredient, credit UNSETTLED'],
    ['POST','/api/purchase-orders/:id/invoices/reconcile','ADMIN','{requestId,invoiceNumber,currency,note?,items:[purchaseOrderItemId,ingredientId?,quantity,unit,unitPrice,total]}','201; 409','MATCHED/DISPUTED theo PO và receipt; financialApproval NOT_GRANTED']
  ];
  write('PURCHASING-API-CONTRACT.md',[
    '# PURCHASING — API CONTRACT ĐÃ TRIỂN KHAI VÀ KIỂM THỬ',
    '',
    'Ngày tổng hợp: '+generatedAt+'; JWT + role middleware hiện hữu, response '+q('{success, message, data}')+'.',
    'Route mới được mount trên Express gốc; test :5004 dùng đúng source route/service/prisma và DB cafedb, không dùng in-memory mock.',
    '',
    '| Method | Route | RBAC | Request DTO | HTTP đã quan sát | Tác dụng nghiệp vụ |',
    '|---|---|---|---|---|---|',
    ...routes.map(row=>'| '+row.map(cell).join(' | ')+' |'),
    '',
    '## Trạng thái nghiệp vụ',
    '',
    '- PurchaseRequest: PENDING→APPROVED (ADMIN) hoặc REJECTED (ADMIN); approval không tạo PO; source thiếu Supplier vẫn PENDING.',
    '- PurchaseOrder: CREATED→SANDBOX_SENT hoặc DISPATCH_UNKNOWN; ADMIN_ATTESTATION→CONFIRMED; CONFIRMED→PARTIALLY_RECEIVED→RECEIVED, hoặc REJECTED với bằng chứng thủ công.',
    '- CREATED có thể CANCELLED; CONFIRMED/PARTIALLY_RECEIVED chỉ REQUEST-CANCEL→CANCELLATION_PENDING. Không kết thúc cam kết thực tế trước khi quy định hủy được duyệt.',
    '- Không xác nhận “đã gửi” nhờ mark-sent nếu adapter SMTP chưa ghi emailSentAt. Endpoints legacy '+q('/api/purchase-requests/:id/send-email')+
      ' chưa được gọi/kiểm chứng với nhà cung cấp thật; không bao gồm trong bảo đảm test-only này.',
    '',
    '## Nhập kho và chi phí',
    '',
    '- PO snapshot unit, conversionToBase, unitPrice và currency ngay khi tạo. Tại receipt, validate batch + ngày hết hạn trong tương lai, quy đổi đơn vị; không tự tạo hạn sử dụng mặc định.',
    '- Ghi số nhận accepted ≤ số còn lại dưới row lock PR; một transaction tạo GoodsReceipt, IngredientBatch, IMPORT, cập nhật Ingredient/PO/PR. Lỗi giữa transaction rollback tất cả.',
    '- requestId receipt đồng nhất với GoodsReceipt.idempotencyKey, requestHash gồm PO, invoice, note và items; trùng key khác dữ liệu trả 409; retry cùng body không tăng kho hai lần.',
    '- Sai nguyên liệu, hàng hỏng, hết hạn hoặc giao vượt được ghi riêng trong PurchaseDeliveryDiscrepancy HELD. Ngưỡng cho phép giao vượt/hạn dùng tối thiểu cần chính sách được duyệt.',
    '- Supplier return đối chiếu GoodsReceipt/IngredientBatch/IMPORT gốc, kiểm tra reserved và quantityRemaining, ghi một RETURN_OUT âm và PurchaseSupplierReturn credit UNSETTLED. Stocktake tính RETURN_OUT là movement vật lý.',
    '- Invoice reconciliation so sánh quantity/unit/price/currency/total/ingredient với snapshot PO và lượng thực nhận; lưu DISPUTED/MATCHED nhưng không tự phê duyệt thanh toán.',
    '',
    '## Phân quyền / idempotency / vận hành',
    '',
    '- Không có public supplier callback không xác thực. ADMIN_APPROVAL luôn là cổng cần thiết; Agent không bypass.',
    '- PO Create, dispatch, confirm, reject, cancel và invoice dùng UUID requestId + hash payload/actor audit; receipt và return có riêng unique requestId.',
    '- NH-16/NH-19 dùng lock PurchaseRequest và row Ingredient; NH-21 dùng PostgreSQL advisory transaction locks trên nguồn nguyên liệu. Merge những nhu cầu nguồn khác nhau vẫn BLOCKED_POLICY.',
    '- Báo cáo HTTP thực tế: '+q('PURCHASING-HTTP-DB-EVIDENCE.json')+
      ', failure rollback: '+q('PURCHASING-FAULT-EVIDENCE.json')+'. Các HTTP 400/403/409 được xem là kết quả mong đợi ở các luồng từ chối.',
    '',
    '## Không được hiểu nhầm',
    '',
    '**Đối với NH-05..08:** trạng thái SANDBOX_SENT hoặc ADMIN_ATTESTATION không chứng minh bên ngoài đã nhận/giao hàng.',
    '**Đối với NH-11, NH-14, NH-18, NH-21:** code xử lý an toàn nhưng chính sách ra quyết định cuối chưa đủ, đánh giá BLOCKED_POLICY.',
    ''
  ]);

  const files=['PURCHASING-API-VERIFICATION.md','PURCHASING-DEFECT-LOG.md','PURCHASING-API-CONTRACT.md'];
  console.log(JSON.stringify({
    verdict:'PARTIAL',backendNhPass:nh.scenarios.filter(x=>x.verdict==='PASS').length,
    accepted:completed,blockedPolicy:blocked,notVerified:unverified,
    rollback:fault.scenarios.length,backendTests:backendPass?'198/198 PASS':'FAIL',
    build:buildPass?'PASS':'FAIL',httpEvents:totalEvents,
    reviewedGaps:problems.length,db:check,
    files:files.map(f=>({name:f,size:fs.statSync(at(f)).size}))
  },null,2));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});

from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.section import WD_SECTION

OUT = r"D:\CTF\NPT\cafe-project\Ke_hoach_kiem_thu_Cafe_Agent_2_nguoi.docx"

doc = Document()
sec = doc.sections[0]
sec.top_margin = Inches(0.7); sec.bottom_margin = Inches(0.7)
sec.left_margin = Inches(0.75); sec.right_margin = Inches(0.75)

styles = doc.styles
styles['Normal'].font.name = 'Aptos'; styles['Normal']._element.rPr.rFonts.set(qn('w:eastAsia'), 'Aptos')
styles['Normal'].font.size = Pt(10)
styles['Normal'].paragraph_format.space_after = Pt(5)
styles['Normal'].paragraph_format.line_spacing = 1.12
for name, size in [('Title', 22), ('Heading 1', 15), ('Heading 2', 12)]:
    st = styles[name]; st.font.name = 'Aptos Display' if name == 'Title' else 'Aptos'
    st._element.rPr.rFonts.set(qn('w:eastAsia'), st.font.name)
    st.font.size = Pt(size); st.font.color.rgb = RGBColor(0, 0, 0)
    st.font.bold = True
    st.paragraph_format.space_before = Pt(14 if name != 'Title' else 0)
    st.paragraph_format.space_after = Pt(6)

def shade(cell, fill):
    tcPr = cell._tc.get_or_add_tcPr(); shd = OxmlElement('w:shd'); shd.set(qn('w:fill'), fill); tcPr.append(shd)

def set_cell_margin(cell, top=80, start=100, bottom=80, end=100):
    tc = cell._tc; tcPr = tc.get_or_add_tcPr(); mar = tcPr.first_child_found_in('w:tcMar')
    if mar is None: mar = OxmlElement('w:tcMar'); tcPr.append(mar)
    for side, val in [('top',top),('start',start),('bottom',bottom),('end',end)]:
        node = mar.find(qn('w:' + side))
        if node is None: node = OxmlElement('w:' + side); mar.append(node)
        node.set(qn('w:w'), str(val)); node.set(qn('w:type'), 'dxa')

def set_repeat_table_header(row):
    trPr = row._tr.get_or_add_trPr(); tag = OxmlElement('w:tblHeader'); tag.set(qn('w:val'), 'true'); trPr.append(tag)

def table(headers, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(headers)); t.alignment = WD_TABLE_ALIGNMENT.CENTER; t.style = 'Table Grid'
    hdr = t.rows[0]; set_repeat_table_header(hdr)
    for i, h in enumerate(headers):
        c = hdr.cells[i]; c.text = h; shade(c, '1F4E78'); c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER; set_cell_margin(c)
        for r in c.paragraphs[0].runs: r.font.bold = True; r.font.color.rgb = RGBColor(255,255,255); r.font.size = Pt(9)
    for row_i, row in enumerate(rows):
        cells = t.add_row().cells
        for i, value in enumerate(row):
            cells[i].text = str(value); cells[i].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER; set_cell_margin(cells[i])
            if row_i % 2: shade(cells[i], 'EDF3F8')
            for p in cells[i].paragraphs:
                p.paragraph_format.space_after = Pt(0)
                for r in p.runs: r.font.size = Pt(8.5)
    if widths:
        for row in t.rows:
            for i, w in enumerate(widths): row.cells[i].width = Inches(w)
    doc.add_paragraph().paragraph_format.space_after = Pt(3)
    return t

def h1(text): doc.add_heading(text, level=1)
def h2(text): doc.add_heading(text, level=2)
def p(text, bold_prefix=None):
    para = doc.add_paragraph()
    if bold_prefix and text.startswith(bold_prefix):
        r = para.add_run(bold_prefix); r.bold = True; para.add_run(text[len(bold_prefix):])
    else: para.add_run(text)
    return para
def bullets(items):
    for item in items:
        para = doc.add_paragraph(style='List Bullet'); para.add_run(item)
def numbered(items):
    for item in items:
        para = doc.add_paragraph(style='List Number'); para.add_run(item)

# Cover
title = doc.add_paragraph(style='Title'); title.alignment = WD_ALIGN_PARAGRAPH.CENTER; title.add_run('Kế hoạch kiểm thử hệ thống Cafe Agent')
sub = doc.add_paragraph(); sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = sub.add_run('Phân công hai người và đánh giá hiệu quả Agent'); r.bold = True; r.font.size = Pt(13)
doc.add_paragraph('Tài liệu hướng dẫn thực hiện kiểm thử chức năng, kiểm thử hệ thống và đánh giá Agent cho dự án quản lý cafe và tồn kho. Kết quả dùng để quyết định mức độ sẵn sàng nghiệm thu và xác định lỗi cần xử lý.', style='Normal')
doc.add_paragraph('Phạm vi gồm web, API, PostgreSQL, Agent, các dịch vụ email, Gemini, upload và triển khai Docker. Mọi thử nghiệm phải sử dụng môi trường test riêng và dữ liệu không nhạy cảm.')
table(['Thông tin', 'Nội dung'], [
    ['Đối tượng', 'Nhóm phát triển và kiểm thử dự án Cafe Agent'],
    ['Nhân sự', '02 người: Người A và Người B'],
    ['Tài liệu tham chiếu', 'README dự án, cấu hình môi trường và log kiểm thử'],
    ['Kết quả cần bàn giao', 'Checklist PASS FAIL BLOCKED, danh sách lỗi, báo cáo đánh giá Agent và so sánh chi phí']
], [1.75, 5.5])

h1('1 Mục tiêu và nguyên tắc kiểm thử')
p('Mục tiêu là xác nhận hệ thống vận hành đúng từ giao diện khách hàng và quản trị đến API, dữ liệu tồn kho và Agent. Việc kiểm thử phải phát hiện lỗi về nghiệp vụ, phân quyền, tính nhất quán dữ liệu, lỗi tích hợp và độ tin cậy của khuyến nghị Agent.')
bullets([
    'Kiểm thử trên cơ sở dữ liệu và tài khoản test. Không ghi mật khẩu, JWT, API key hoặc thông tin khách hàng thật vào báo cáo.',
    'Ghi cho mỗi ca: mã ca, dữ liệu đầu vào, bước thực hiện, kết quả mong đợi, kết quả thực tế, trạng thái, bằng chứng và mã lỗi.',
    'Không chạy song song các ca thay đổi cùng SKU, đơn hàng hoặc purchase request. Ghi ID dữ liệu trước và sau mỗi ca.',
    'Ca bị chặn do môi trường hoặc tích hợp chưa cấu hình phải ghi BLOCKED cùng nguyên nhân; không đánh dấu PASS theo suy đoán.'
])

h1('2 Chuẩn bị môi trường')
numbered([
    'Cài dependencies, tạo Prisma client, áp schema và seed vào PostgreSQL test theo README dự án.',
    'Khởi động Web, API và Agent; kiểm tra endpoint health và xác nhận đăng nhập được bằng tài khoản seed.',
    'Chuẩn bị hai profile trình duyệt độc lập cho vai trò admin và customer; ghi lại SKU, tồn đầu kỳ, threshold, supplier, giá và request đang mở.',
    'Nếu có, cấu hình SMTP sandbox, Cloudinary test và Gemini test. Nếu không có, vẫn kiểm tra lỗi có kiểm soát và fallback rule based.'
])
p('Không chạy script migration được đánh dấu không chạy trên môi trường test. Không reset hoặc seed nhầm database production.')

h1('3 Phân công hai người')
table(['Người', 'Trách nhiệm chính', 'Đầu ra'], [
    ['Người A', 'Giao diện web và luồng khách hàng; chạy phần thủ công trong so sánh Agent; xác nhận UI admin.', 'Checklist UI, bằng chứng ảnh, thời gian làm thủ công, bug giao diện.'],
    ['Người B', 'API, database, phân quyền, CRUD admin, tồn kho, Agent, Docker và benchmark Agent.', 'Checklist API và dữ liệu, fixture benchmark, log Agent, số liệu latency và báo cáo điểm.'],
    ['Cả hai', 'Luồng tích hợp chéo, duyệt nhãn chuẩn benchmark, hồi quy và nghiệm thu.', 'Báo cáo tổng hợp PASS FAIL BLOCKED và quyết định nghiệm thu.']
], [1.1, 3.2, 2.95])

h1('4 Checklist Người A Web và trải nghiệm khách hàng')
h2('4.1 Điều hướng và giao diện')
bullets([
    'Mở trang chủ, tải lại, back forward và URL con trực tiếp; không có trang trắng hoặc lỗi console nghiêm trọng.',
    'Kiểm tra header, footer, liên kết Home, Products, Cart, Login, Profile, My Orders và URL không tồn tại.',
    'Kiểm tra desktop và mobile: không tràn ngang, form và modal hiển thị đầy đủ, có loading, empty state, lỗi mạng và toast rõ ràng.'
])
h2('4.2 Tài khoản và bảo vệ route')
bullets([
    'Đăng ký và đăng nhập hợp lệ; thử email sai, email trùng, trường rỗng và mật khẩu không hợp lệ.',
    'Đăng xuất, refresh, đóng mở tab; profile, đổi mật khẩu, quên và reset mật khẩu khi dịch vụ hỗ trợ.',
    'Customer và người chưa đăng nhập không vào được route admin, kể cả khi nhập URL trực tiếp.'
])
h2('4.3 Sản phẩm và giỏ hàng')
bullets([
    'Danh sách và chi tiết sản phẩm hiển thị ảnh hoặc fallback, giá, danh mục, trạng thái tồn; thử tìm kiếm lọc và kết quả rỗng nếu có.',
    'Thêm, sửa số lượng, xóa sản phẩm và xóa toàn bộ giỏ; tổng tiền cập nhật đúng.',
    'Thử số lượng 0, âm, lẻ, rất lớn, hàng hết hoặc đã xóa; giao diện không cho đặt vượt tồn.'
])
h2('4.4 Checkout và đơn hàng')
bullets([
    'Kiểm tra trường địa chỉ, số điện thoại và thông tin bắt buộc; thử dữ liệu sai hoặc quá dài.',
    'Tạo đơn với COD, CASH hoặc BANK TRANSFER theo giao diện; double click hoặc tải lại không tạo đơn trùng.',
    'Đối chiếu mã đơn, tổng tiền, phí giao hàng, thanh toán và trạng thái trên My Orders; customer không xem được đơn người khác.'
])
h2('4.5 UI quản trị')
bullets([
    'Kiểm tra menu, dashboard, thông báo, bảng, form, modal, loading và toast tại Products, Categories, Inventory, Suppliers, Orders, Purchase Requests, Agent Logs, Users và Settings.',
    'Kiểm tra filter, sort, pagination và hành vi hủy form; gửi cho Người B ID bản ghi khi thấy sai khác với dữ liệu.'
])

h1('5 Checklist Người B API dữ liệu Agent và vận hành')
h2('5.1 Nền tảng API và bảo mật')
bullets([
    'Health check, lỗi cấu hình, kết nối DB, schema, khóa unique và foreign key.',
    'Endpoint sai method path body JSON ID hoặc kiểu dữ liệu; response không lộ stack trace hoặc secret.',
    'CORS, JWT thiếu sai hết hạn, role customer admin và IDOR. Quyền phải được kiểm tra ở server.'
])
h2('5.2 Danh mục sản phẩm upload và supplier')
bullets([
    'CRUD category product: SKU trùng, giá hoặc stock âm, category không tồn tại, xóa dữ liệu đang tham chiếu.',
    'Upload: file rỗng, quá lớn, MIME giả, định dạng không cho phép, Cloudinary thiếu credentials.',
    'Supplier và supplier product: active inactive deleted, giá, lead time, minimum order và liên kết trùng.'
])
h2('5.3 Tồn kho đơn hàng và thanh toán')
bullets([
    'Import và adjustment: tồn, batch, transaction, hạn dùng, đơn vị, reserved stock, audit actor và rollback.',
    'Yêu cầu đồng thời hoặc retry trên cùng SKU: không âm kho, mất cập nhật hoặc lệch inventory với batch.',
    'Tạo xác nhận hủy đơn: server tự tính giá, transition trạng thái hợp lệ, trừ kho đúng một lần, payment và shipping fee đúng.'
])
h2('5.4 Purchase request Agent cron và Docker')
bullets([
    'Purchase request: validate supplier product quantity email; approve send retry và trạng thái SMTP failure.',
    'Agent internal token, scan theo threshold, log, dedupe open request, rule based, Gemini error timeout và fallback.',
    'Scan once và cron trên fixture test; dashboard notification đồng nhất dữ liệu.',
    'Docker Compose: web API agent PostgreSQL khởi động, URL CORS port đúng, restart không làm mất data volume.'
])

h1('6 Kịch bản tích hợp chéo')
table(['Mã', 'Luồng', 'Điểm xác nhận'], [
    ['E1', 'Customer đặt hàng đến admin confirm', 'Order item, giá, payment, trạng thái UI, tồn kho, batch và transaction chỉ thay đổi một lần.'],
    ['E2', 'Tồn thấp đến Agent và purchase request', 'Agent log, supplier, quantity đề xuất, không tạo request trùng, approve và email sandbox hoặc lỗi có kiểm soát.'],
    ['E3', 'Admin CRUD đến storefront', 'Category product price stock image thay đổi đúng ở web; sản phẩm không bán không thể được mua; lịch sử đơn cũ còn nguyên.']
], [0.55, 2.2, 4.5])

h1('7 Đánh giá Agent')
p('Đánh giá Agent là phần bắt buộc bên cạnh kiểm thử tay. Mục tiêu là đo độ chính xác khi thực hiện hành động, tỷ lệ bịa hoặc sai dữ kiện và thời gian phản hồi. Không dùng output của Agent làm nhãn chuẩn; nhãn chuẩn phải dựa vào fixture, database và quy tắc nghiệp vụ đã được hai người duyệt.')
h2('7.1 Bộ dữ liệu đánh giá')
table(['Nhóm', 'Số ca tối thiểu', 'Ví dụ'], [
    ['Hành động đúng', '10', 'Tồn thấp cần scan và recommendation; tồn đủ không tạo request; chọn supplier active; ghi log đúng.'],
    ['Đúng dữ kiện chống bịa', '10', 'Tồn bằng ngưỡng, tồn 0, không lịch sử bán, không supplier, supplier inactive, request đang mở.'],
    ['Lỗi và fallback', '5', 'Gemini thiếu key, timeout hoặc lỗi; DB Agent SMTP unavailable; input sai và retry.'],
    ['Dữ liệu biên', '5', 'SKU gần giống, đơn vị khác nhau, lượng lớn, tên tiếng Việt, product xóa mềm hoặc không tồn tại.']
], [1.45, 1.25, 4.55])
p('Mỗi case lưu case ID, snapshot fixture trước sau, input hoặc prompt, action tool mong đợi, arguments, kết quả mong đợi, nguồn bằng chứng, mode rule based Gemini fallback, thời gian và kết quả từng lượt. Mỗi case chạy ba lần trong cùng cấu hình. Nếu Gemini chưa được cấu hình, ghi Gemini live là BLOCKED; vẫn đánh giá đầy đủ rule based và fallback.')
h2('7.2 Ba chỉ số bắt buộc')
table(['Chỉ số', 'Cách đo', 'Điều kiện đúng'], [
    ['Độ chính xác tool action', 'Số case có đúng tập action và arguments chia tổng case, nhân 100 phần trăm.', 'Đúng action, đúng tài nguyên ID, đúng tham số và không có side effect cấm. Không cần gọi mà vẫn gọi là sai.'],
    ['Tỷ lệ ảo giác', 'Số output có ít nhất một dữ kiện bịa hoặc sai chia số output có nội dung, nhân 100 phần trăm.', 'Đối chiếu tồn, threshold, supplier, giá, lead time, sales velocity, quantity và trạng thái request với fixture DB log.'],
    ['Thời gian phản hồi', 'Đo từ lúc gửi yêu cầu đến phản hồi hoàn chỉnh; báo p50, p95 và tỷ lệ timeout.', 'Timeout và lỗi vẫn phải được giữ trong thống kê. Với async ghi riêng thời gian phản hồi và hoàn tất side effect.']
], [1.35, 2.65, 3.25])
p('Nếu implementation không expose tool call có cấu trúc, báo cáo chỉ số là action accuracy dựa trên API, database và log có thể quan sát. Báo cáo phải ghi rõ giới hạn này.')
h2('7.3 Barem chấm điểm')
table(['Hạng mục', 'Trọng số', 'Mốc tối đa', 'Quy đổi'], [
    ['Tool action accuracy', '40', '>= 95 phần trăm', 'Điểm = tỷ lệ thực tế chia 95 phần trăm nhân 40; tối đa 40.'],
    ['Không ảo giác', '35', 'Hallucination <= 2 phần trăm và 0 lỗi nghiêm trọng', 'Điểm = max 0 của 1 trừ tỷ lệ ảo giác chia 2 phần trăm, nhân 35. Lỗi nghiêm trọng làm kết quả không đạt.'],
    ['Latency', '25', 'p50 <= 2 giây, p95 <= 5 giây, timeout <= 1 phần trăm', 'Đủ cả ba: 25. P95 <= 10 giây và timeout <= 5 phần trăm: 15. Còn lại: 0.']
], [1.5, 0.8, 2.3, 3.0])
p('Đạt khi tổng từ 85 trên 100, action accuracy tối thiểu 90 phần trăm, hallucination không quá 2 phần trăm, không có lỗi nghiêm trọng và timeout không quá 5 phần trăm. Đạt tốt khi tổng từ 95, action accuracy tối thiểu 95 phần trăm, không ảo giác, p95 không quá 5 giây và timeout không quá 1 phần trăm.')

h1('8 So sánh Agent và quy trình thủ công')
numbered([
    'Dùng cùng tối thiểu 20 kịch bản tồn kho và đặt nhập từ gold set; reset fixture trước mỗi lượt.',
    'Người A làm theo SOP thủ công: xem tồn, threshold, supplier, tính lượng đề nghị, tạo request và log. Bấm giờ từ lúc nhận case đến khi hoàn thành; không được xem kết quả Agent trước.',
    'Chạy Agent trên snapshot tương đương. Ghi latency, thời gian giám sát, thời gian sửa output, kết quả cuối và lỗi.',
    'Hoán đổi người làm thủ công giữa các nhóm case để giảm ảnh hưởng tốc độ cá nhân.',
    'Chỉ sử dụng đơn giá lao động, model API và hạ tầng do nhóm cung cấp. Không tự giả định giá.'
])
table(['Chỉ số', 'Công thức'], [
    ['Chi phí thủ công mỗi ca', 'Phút thao tác x đơn giá lao động mỗi phút + chi phí lỗi hoặc sửa lại.'],
    ['Chi phí Agent mỗi ca', 'Phút giám sát và sửa lỗi x đơn giá lao động mỗi phút + model API + hạ tầng phân bổ + chi phí lỗi.'],
    ['Tiết kiệm ròng mỗi ca', 'Chi phí thủ công trừ chi phí Agent.'],
    ['Tỷ lệ tiết kiệm', 'Tiết kiệm ròng chia chi phí thủ công, nhân 100 phần trăm. Nếu chi phí thủ công bằng 0 thì ghi N A.']
], [2.0, 5.6])

h1('9 Mẫu biểu ghi nhận')
h2('9.1 Mẫu bug')
table(['Trường', 'Nội dung cần ghi'], [
    ['ID và mức độ', 'BUG số, P0 Blocker, P1 Critical, P2 Major hoặc P3 Minor.'],
    ['Môi trường', 'Commit, browser hoặc service version, mode Agent; không ghi secret.'],
    ['Tiền điều kiện', 'SKU hoặc order ID test, tồn, threshold, supplier, request hiện có.'],
    ['Tái hiện', 'Bước cụ thể, input và kết quả mong đợi.'],
    ['Thực tế và bằng chứng', 'Kết quả hiện tại, tần suất, ảnh hoặc API response đã che dữ liệu nhạy cảm.']
], [1.6, 6.0])
h2('9.2 Bảng kết quả Agent')
table(['Mode config', 'Số case lượt', 'Action accuracy', 'Hallucination', 'Lỗi nghiêm trọng', 'p50 p95', 'Timeout', 'Điểm', 'Kết luận'], [
    ['Rule based', '', '', '', '', '', '', '', ''],
    ['Gemini nếu cấu hình', '', '', '', '', '', '', '', ''],
    ['Fallback khi Gemini lỗi', '', '', '', '', '', '', '', '']
], [1.05, 0.7, 0.9, 0.8, 0.85, 0.75, 0.65, 0.55, 0.9])
h2('9.3 Bảng tổng kết nghiệm thu')
table(['Phạm vi', 'Tổng ca', 'Pass', 'Fail', 'Blocked', 'Bug ID'], [
    ['Người A Web và khách hàng', '', '', '', '', ''],
    ['Người A UI admin', '', '', '', '', ''],
    ['Người B API auth dữ liệu', '', '', '', '', ''],
    ['Người B Agent integrations ops', '', '', '', '', ''],
    ['Tích hợp chéo', '', '', '', '', ''],
    ['So sánh thủ công và Agent', '', '', '', '', ''],
    ['Hồi quy nghiệm thu', '', '', '', '', '']
], [2.7, 0.7, 0.65, 0.65, 0.75, 1.2])

h1('10 Điều kiện nghiệm thu')
bullets([
    'Không còn lỗi P0 hoặc P1; lỗi còn lại có mức độ, phạm vi, workaround và người xử lý rõ ràng.',
    'Không có sai lệch tồn kho, batch, order total, payment, purchase request hoặc phân quyền trong các ca đã chạy.',
    'Các ca hồi quy sau sửa lỗi đạt; kết quả build lint type check và test tự động hiện có được ghi lại nếu được thực hiện.',
    'Báo cáo Agent có đủ gold set, logs đã che secret, ba chỉ số, điểm, kết quả manual comparison và các giả định chi phí.',
    'Mọi mục BLOCKED nêu rõ cấu hình còn thiếu, ví dụ SMTP Gemini Cloudinary, cùng cách retest khi sẵn sàng.'
])

# Footer
for section in doc.sections:
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fr = footer.add_run('Cafe Agent | Kế hoạch kiểm thử')
    fr.font.size = Pt(8); fr.font.color.rgb = RGBColor(100,100,100)

doc.core_properties.title = 'Kế hoạch kiểm thử hệ thống Cafe Agent'
doc.core_properties.subject = 'Phân công hai người và đánh giá Agent'
doc.core_properties.author = 'Cafe Agent Project'
doc.save(OUT)
print(OUT)

from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_BREAK
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

PATH = r"D:\CTF\NPT\cafe-project\Ke_hoach_kiem_thu_Cafe_Agent_2_nguoi.docx"
doc = Document(PATH)

def shade(cell, fill):
    tcPr = cell._tc.get_or_add_tcPr(); shd = OxmlElement('w:shd'); shd.set(qn('w:fill'), fill); tcPr.append(shd)

def margin(cell):
    tcPr = cell._tc.get_or_add_tcPr(); mar = OxmlElement('w:tcMar')
    for side, val in [('top','80'),('start','100'),('bottom','80'),('end','100')]:
        n = OxmlElement('w:' + side); n.set(qn('w:w'), val); n.set(qn('w:type'), 'dxa'); mar.append(n)
    tcPr.append(mar)

def repeat(row):
    trPr = row._tr.get_or_add_trPr(); tag = OxmlElement('w:tblHeader'); tag.set(qn('w:val'),'true'); trPr.append(tag)

def table(headers, rows, widths):
    t = doc.add_table(rows=1, cols=len(headers)); t.style = 'Table Grid'; t.alignment = WD_TABLE_ALIGNMENT.CENTER
    repeat(t.rows[0])
    for i, text in enumerate(headers):
        c=t.rows[0].cells[i]; c.text=text; shade(c,'1F4E78'); margin(c); c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
        for r in c.paragraphs[0].runs: r.font.bold=True; r.font.color.rgb=RGBColor(255,255,255); r.font.size=Pt(8.5)
    for ri,row in enumerate(rows):
        cells=t.add_row().cells
        for i,text in enumerate(row):
            c=cells[i]; c.text=text; margin(c); c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
            if ri % 2: shade(c,'EDF3F8')
            for p in c.paragraphs:
                p.paragraph_format.space_after=Pt(0)
                for r in p.runs: r.font.size=Pt(8.2)
    for row in t.rows:
        for i,w in enumerate(widths): row.cells[i].width=Inches(w)
    doc.add_paragraph()

doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
doc.add_heading('11 Phân công kiểm thử AI Agent', level=1)
doc.add_paragraph('Phần này quy định cách hai người phối hợp đánh giá AI Agent độc lập, có thể lặp lại và tránh thiên lệch. Người tạo nhãn chuẩn không tự chấm lượt chạy tương ứng; mọi ca có tác dụng phụ phải chạy trên fixture đã reset.')

doc.add_heading('11.1 Vai trò và trách nhiệm', level=2)
table(['Công việc', 'Người A', 'Người B', 'Bằng chứng hoàn thành'], [
    ['Thiết kế dữ liệu test', 'Rà soát tình huống nghiệp vụ theo góc nhìn người dùng: thiếu hàng, supplier, đơn hàng và request trùng.', 'Tạo fixture DB cô lập, snapshot trước sau, xác định endpoint log và cấu hình rule based Gemini fallback.', 'Danh sách case, SKU test, snapshot và điều kiện reset.'],
    ['Nhãn chuẩn', 'Đề xuất kết quả nghiệp vụ: có cần tạo request, supplier nào, quantity hợp lệ, khi nào cần từ chối.', 'Đối chiếu thuật toán, min order, lead time, threshold và constraints từ DB API.', 'Gold set được cả hai ký duyệt trước khi chạy.'],
    ['Chạy benchmark', 'Chạy các lượt Gemini và fallback theo thứ tự case đã khóa; bấm giờ và lưu output raw đã che secret.', 'Chạy rule based và API side effect; bấm giờ và ghi request response log DB.', 'Ba lượt mỗi case, timestamp và mode config.'],
    ['Chấm kết quả', 'Chấm case do Người B chạy, đối chiếu output với gold set và đánh dấu dữ kiện bịa.', 'Chấm case do Người A chạy, đối chiếu action arguments và side effect.', 'Bảng pass fail, action accuracy, hallucination và latency.'],
    ['So sánh thủ công', 'Thực hiện thao tác thủ công ở nhóm case 1, 3, 5; không xem kết quả Agent trước.', 'Thực hiện thao tác thủ công ở nhóm case 2, 4, 6; không xem kết quả Agent trước.', 'Thời gian, số bước, lỗi, thời gian sửa và chi phí mỗi ca.'],
    ['Tổng hợp', 'Kiểm tra báo cáo dễ hiểu, ảnh UI và tác động đến người dùng.', 'Tính p50 p95 timeout, điểm tổng, lọc dữ liệu trùng và liên kết log kỹ thuật.', 'Báo cáo nghiệm thu Agent và danh sách bug.']
], [1.25, 1.8, 2.1, 2.0])

doc.add_heading('11.2 Cách chạy mỗi case', level=2)
steps = [
    'Người B reset fixture và ghi snapshot tồn, threshold, supplier, purchase request và cấu hình Agent. Người A xác nhận case đúng điều kiện nhãn chuẩn.',
    'Người chấm khóa expected action, expected arguments và dữ kiện được phép dùng trước khi Agent chạy. Không sửa nhãn sau khi đã xem output.',
    'Người vận hành gửi input, đo thời gian từ lúc gửi đến phản hồi hoàn chỉnh. Nếu Agent xử lý bất đồng bộ, đo thêm thời gian đến khi DB hoặc log có side effect.',
    'Người còn lại chấm độc lập: action hoặc tool có đúng không, dữ kiện nào sai hoặc bịa, side effect có đúng và có trùng không.',
    'Hai người đối chiếu khi khác kết quả. Nếu bất đồng về nghiệp vụ, case được tạm ghi REVIEW và không đưa vào điểm cho đến khi có nhãn thống nhất.',
    'Người B reset fixture cho lượt tiếp theo. Mỗi case chạy ba lượt; timeout và error giữ lại trong số liệu.'
]
for s in steps:
    doc.add_paragraph(s, style='List Number')

doc.add_heading('11.3 Ma trận phân chia case', level=2)
table(['Nhóm case', 'Người chuẩn bị', 'Người chạy', 'Người chấm chính', 'Số lượt'], [
    ['A01 đến A05 tồn thấp và recommendation', 'B', 'A', 'B', '3 mỗi case'],
    ['A06 đến A10 không cần action và request trùng', 'B', 'A', 'B', '3 mỗi case'],
    ['B01 đến B05 supplier quantity và constraints', 'A', 'B', 'A', '3 mỗi case'],
    ['B06 đến B10 dữ kiện thiếu hoặc xung đột', 'A', 'B', 'A', '3 mỗi case'],
    ['C01 đến C05 Gemini timeout error fallback', 'B', 'A', 'B', '3 mỗi case'],
    ['C06 đến C10 tiếng Việt SKU gần giống dữ liệu biên', 'A', 'B', 'A', '3 mỗi case']
], [2.1, 1.1, 1.0, 1.35, 1.0])

doc.add_heading('11.4 Quy tắc chấm lỗi Agent', level=2)
table(['Loại lỗi', 'Ví dụ', 'Cách ghi nhận'], [
    ['Sai action', 'Tạo purchase request khi tồn còn đủ; gọi sai SKU hoặc supplier.', 'Tool action sai. Không đạt case.'],
    ['Sai arguments', 'Supplier đúng nhưng quantity thấp hơn minimum order; product ID sai.', 'Tool action sai. Ghi arguments thực tế và expected.'],
    ['Ảo giác', 'Khẳng định tồn, supplier, lead time hoặc request đã gửi nhưng fixture DB log không có.', 'Hallucination. Nêu từng dữ kiện sai và nguồn đối chiếu.'],
    ['Lỗi nghiêm trọng', 'Bịa supplier hoặc tồn dẫn tới quyết định nhập hàng sai; khẳng định side effect không tồn tại.', 'Critical hallucination. Toàn bộ vòng không đạt dù tổng điểm cao.'],
    ['Xử lý an toàn', 'Dữ liệu thiếu nên nêu rõ không thể đề xuất; fallback có log và không tạo request sai.', 'Không phải ảo giác. Chấm hoàn thành hoặc từ chối đúng theo gold set.']
], [1.25, 3.1, 2.2])

doc.add_heading('11.5 Lịch thực hiện gợi ý', level=2)
table(['Buổi', 'Người A', 'Người B', 'Kết quả'], [
    ['1', 'Rà soát nghiệp vụ và duyệt 30 gold cases.', 'Chuẩn bị fixture, snapshot, reset script và log collection.', 'Gold set khóa phiên bản.'],
    ['2', 'Chạy Gemini fallback nhóm A và C; đo latency.', 'Chạy rule based nhóm B; kiểm tra side effect.', 'Kết quả raw ba lượt mỗi case.'],
    ['3', 'Chấm case do B vận hành; chạy manual nhóm 1 3 5.', 'Chấm case do A vận hành; chạy manual nhóm 2 4 6.', 'Chấm chéo và số liệu manual.'],
    ['4', 'Xác minh UI và tác động nghiệp vụ của lỗi.', 'Tính score p50 p95 chi phí và tạo bug report.', 'Báo cáo nghiệm thu và retest plan.']
], [0.6, 2.25, 2.4, 1.3])

doc.save(PATH)
print(PATH)

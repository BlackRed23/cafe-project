from docx import Document
import sys

for path in sys.argv[1:]:
    d = Document(path)
    print('\nDOC:', path)
    print('sections', len(d.sections), 'paragraphs', len(d.paragraphs), 'tables', len(d.tables))
    for i, paragraph in enumerate(d.paragraphs):
        text = paragraph.text.strip()
        if text:
            print('P', i, '[', paragraph.style.name, ']', text[:500])
    for i, table in enumerate(d.tables):
        print('TABLE', i)
        for row in table.rows:
            print(' | '.join(cell.text.replace('\n', ' / ')[:400] for cell in row.cells))

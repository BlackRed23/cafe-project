import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowRight, BookOpen, ClipboardList, Clock3, Database,
  ExternalLink, LockKeyhole, RefreshCw, ShieldCheck, Sparkles, Workflow } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { agentWorkspaceApi } from '../../api/agentWorkspace.api';
import { purchaseRequestsApi } from '../../api/purchaseRequests.api';
import type { PurchaseRequest } from '../../types/purchaseRequest.types';
import type { AgentRunSummary, AuditPage } from '../../features/agent/agentWorkspace.types';
import { AGENT_PHASES, EMPTY_EVIDENCE, phaseEvidence } from '../../features/agent/agentWorkspace.presentation';
import { AgentStatusPill } from '../../features/agent/AgentStatusPill';
import './agent-workspace.css';

const dateText = (value?: string | null): string => {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Chưa được ghi nhận';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
};
const safeError = (error: unknown) => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 401) return 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.';
  if (status === 403) return 'Bạn không có quyền truy cập dữ liệu này (403).';
  if (status === 404) return 'Không tìm thấy run thuộc phạm vi quyền truy cập (404).';
  // Do not render raw backend stack traces, internal responses or error payloads.
  if (error instanceof Error && error.message.startsWith('Mã run')) return error.message;
  if (error instanceof Error && /cấu trúc|xác minh|không hợp lệ/.test(error.message)) return error.message;
  return 'Không tải được dữ liệu. Vui lòng thử lại hoặc kiểm tra quyền truy cập.';
};

const Section: React.FC<{ title: string; eyebrow: string; children: React.ReactNode; id?: string }> =
  ({ title, eyebrow, children, id }) => (
    <section id={id} className="agent-panel" aria-label={title}>
      <div className="agent-section-head"><span className="agent-eyebrow">{eyebrow}</span><h2>{title}</h2></div>
      {children}
    </section>
  );

const Unavailable: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <p className="agent-unavailable"><Database size={15} aria-hidden="true" /> {children || EMPTY_EVIDENCE}</p>
);

export const AdminAgentWorkspacePage: React.FC = () => {
  const { isAdmin, isStaff } = useAuth();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('runId') || '';
  const [runInput, setRunInput] = useState(selectedId);
  const [runResult, setRunResult] = useState<{
    id: string; revision: number; value: AgentRunSummary | null; error: string | null
  } | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [runRefresh, setRunRefresh] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditRefresh, setAuditRefresh] = useState(0);
  const [auditResult, setAuditResult] = useState<{
    page: number; revision: number; value: AuditPage | null; error: string | null
  } | null>(null);
  const [purchasingResult, setPurchasingResult] = useState<{
    value: PurchaseRequest[]; error: string | null
  } | null>(null);

  const matchedRun = runResult?.id === selectedId && runResult.revision === runRefresh ? runResult : null;
  const run = isAdmin ? matchedRun?.value || null : null;
  const runLoading = isAdmin && Boolean(selectedId) && !matchedRun;
  const runError = inputError || matchedRun?.error || null;
  const matchedAudit = auditResult?.page === auditPage && auditResult.revision === auditRefresh ? auditResult : null;
  const audit = matchedAudit?.value || null;
  const auditLoading = (isAdmin || isStaff) && !matchedAudit;
  const auditError = matchedAudit?.error || null;
  const requests = purchasingResult?.value || [];
  const purchasingLoading = (isAdmin || isStaff) && !purchasingResult;
  const purchasingError = purchasingResult?.error || null;

  useEffect(() => {
    let alive = true;
    if (!isAdmin || !selectedId) return;
    agentWorkspaceApi.runSummary(selectedId).then(data => {
      if (alive) setRunResult({ id: selectedId, revision: runRefresh, value: data, error: null });
    }).catch(error => {
      if (alive) setRunResult({ id: selectedId, revision: runRefresh, value: null, error: safeError(error) });
    });
    return () => { alive = false; };
  }, [isAdmin, selectedId, runRefresh]);
  useEffect(() => {
    let alive = true;
    if (!isAdmin && !isStaff) return;
    agentWorkspaceApi.auditPage(auditPage).then(page => {
      if (alive) setAuditResult({ page: auditPage, revision: auditRefresh, value: page, error: null });
    }).catch(error => {
      if (alive) setAuditResult({ page: auditPage, revision: auditRefresh, value: null, error: safeError(error) });
    });
    return () => { alive = false; };
  }, [isAdmin, isStaff, auditPage, auditRefresh]);
  useEffect(() => {
    let alive = true;
    if (!isAdmin && !isStaff) return;
    purchaseRequestsApi.getPurchaseRequests().then(data => {
      if (alive) setPurchasingResult({ value: data.filter(request => request.aiGenerated === true).slice(0, 8), error: null });
    }).catch(error => { if (alive) setPurchasingResult({ value: [], error: safeError(error) }); });
    return () => { alive = false; };
  }, [isAdmin, isStaff]);

  const findRun = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = runInput.trim();
    if (id && !/^[A-Za-z0-9_-]{1,120}$/.test(id)) {
      setInputError('Mã run không hợp lệ. Chỉ sử dụng chữ, số, dấu gạch ngang hoặc gạch dưới.');
      return;
    }
    setInputError(null);
    const next = new URLSearchParams(params);
    if (id) next.set('runId', id); else next.delete('runId');
    setParams(next);
    if (id === selectedId) setRunRefresh(value => value + 1);
  };

  return (
    <div className="agent-workspace">
      <header className="agent-hero">
        <div className="agent-hero-content">
          <span className="agent-kicker"><Sparkles size={15} aria-hidden="true" /> AGENT OPERATIONS / 01</span>
          <h1>Trung tâm AI Agent</h1>
          <p>Quan sát các quyết định có bằng chứng, nhận diện trạng thái cần xem xét và điều hướng đến đúng nghiệp vụ.</p>
          <div className="agent-hero-links">
            <Link to="/admin/agent-logs"><BookOpen size={16} aria-hidden="true" /> Nhật ký chi tiết</Link>
            <Link to="/admin/ingredients"><Database size={16} aria-hidden="true" /> Kho nguyên liệu</Link>
            <Link to="/admin/purchase-requests"><ClipboardList size={16} aria-hidden="true" /> Yêu cầu nhập hàng</Link>
          </div>
        </div>
        <div className="agent-hero-mark" aria-hidden="true"><Workflow size={66} strokeWidth={1} /><span>Evidence first.</span></div>
      </header>

      <div className="agent-stat-grid" aria-label="Tổng quan khả năng">
        <div className="agent-stat"><span>QUYỀN HIỆN TẠI</span><strong>{isAdmin ? 'ADMIN' : isStaff ? 'STAFF' : 'Không xác định'}</strong><small>Backend kiểm tra quyền độc lập</small></div>
        <div className="agent-stat"><span>RUN ĐƯỢC CHỌN</span><strong>{run ? 'Đã xác minh' : runLoading ? 'Đang tải' : 'Chưa xác minh'}</strong><small>{selectedId ? 'Tra cứu theo mã run' : 'Chưa có API danh sách run'}</small></div>
        <div className="agent-stat"><span>TRẠNG THÁI</span><strong>{run ? <AgentStatusPill status={run.status} /> : 'Chưa có dữ liệu'}</strong><small>Chỉ phản ánh trạng thái Backend</small></div>
        <div className="agent-stat"><span>HÀNH ĐỘNG</span><strong>{run?.blocked ? 'Chờ xem xét' : 'Chỉ đọc'}</strong><small>Không tự động cấp quyền phê duyệt</small></div>
      </div>

      <div className="agent-main-grid">
        <div className="agent-main-column">
          <Section eyebrow="01 / AGENT WORKSPACE" title="Theo dõi lần thực thi">
            {isAdmin ? (
              <form className="agent-run-form" onSubmit={findRun}>
                <label htmlFor="agent-run-id">Mã run do Backend cung cấp</label>
                <div className="agent-input-row">
                  <input id="agent-run-id" value={runInput} onChange={e => { setRunInput(e.target.value); setInputError(null); }} maxLength={120}
                    placeholder="Nhập mã AgentExecution" autoComplete="off" aria-describedby="agent-run-help" />
                  <button type="submit">Tra cứu</button>
                  <button type="button" className="agent-outline" aria-label="Tải lại run"
                    disabled={!selectedId || runLoading} onClick={() => setRunRefresh(n => n + 1)}><RefreshCw size={17} /></button>
                </div>
                <p id="agent-run-help" className="agent-footnote">Chỉ run thuộc chính tài khoản ADMIN đăng nhập mới được xem. Chưa có API danh sách/current run.</p>
              </form>
            ) : <Unavailable>STAFF có quyền xem nhật ký, nhưng API tóm tắt run chỉ dành cho ADMIN.</Unavailable>}
            {runLoading && <p className="agent-loading" role="status">Đang lấy trạng thái run từ Backend…</p>}
            {runError && <p className="agent-error" role="alert"><AlertCircle size={16} />{runError}</p>}
            {run && !runLoading && (
              <div className="agent-run-summary">
                <div className="agent-record-head"><code>{run.runId}</code><AgentStatusPill status={run.status} /></div>
                <dl className="agent-facts">
                  <div><dt>Yêu cầu người dùng</dt><dd>Không được API cung cấp</dd></div>
                  <div><dt>Giai đoạn hiện tại</dt><dd>Chưa được Backend công bố</dd></div>
                  <div><dt>Bắt đầu</dt><dd>{dateText(run.startedAt)}</dd></div>
                  <div><dt>Kết thúc</dt><dd>{dateText(run.completedAt)}</dd></div>
                  <div><dt>Kết quả trạng thái</dt><dd>{run.messageVi}</dd></div>
                  <div><dt>Kết quả nghiệp vụ</dt><dd>Chưa có chứng cứ kết quả nghiệp vụ từ API</dd></div>
                </dl>
                {(run.blocked || run.warnings.length > 0) && <p className="agent-warning" role="status">
                  <AlertCircle size={16} /> {run.blocked ? 'HOLD: cần người có thẩm quyền xem xét qua quy trình Backend.' :
                    'Cảnh báo: Agent đã sử dụng cơ chế dự phòng.'}
                </p>}
                <p className="agent-footnote">Hành động tiếp theo: {run.blocked ? 'Xem xét bằng quy trình hiện có; không thể phê duyệt tại màn hình này.' :
                  'Đối chiếu nhật ký và nghiệp vụ liên quan. API này không cung cấp hành động thực thi.'}</p>
              </div>
            )}
            {!run && !runLoading && !runError && isAdmin && <Unavailable>Chọn mã AgentExecution hợp lệ để xem trạng thái được xác minh. Không tự tạo dữ liệu run.</Unavailable>}
            <div className="agent-composer">
              <label htmlFor="agent-request">Yêu cầu bằng ngôn ngữ tự nhiên</label>
              <textarea id="agent-request" placeholder="Chưa khả dụng: không có endpoint hội thoại đã xác minh." disabled rows={2} />
              <button disabled title="Chưa có API yêu cầu bằng ngôn ngữ tự nhiên">Gửi yêu cầu · Chưa tích hợp</button>
            </div>
          </Section>

          <Section eyebrow="02 / EXECUTION TRACE" title="Dòng thời gian xử lý" id="agent-timeline">
            <p className="agent-intro">Các pha bên dưới là khung quy trình, không phải bằng chứng đã chạy. Chỉ lời gọi công cụ được Backend xác nhận mới được hiển thị.</p>
            <ol className="agent-timeline">
              {AGENT_PHASES.map(([code, title], i) => (
                <li key={code}>
                  <span className="agent-phase-index" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                  <div><div className="agent-phase-title"><strong>{code}</strong><span>{title}</span></div>
                    <p>{phaseEvidence(run, code)}</p>
                    {code === 'ACT' && run && run.selectedTools.length > 0 && <a href="#agent-tools">Xem trạng thái công cụ</a>}
                  </div><span className="agent-phase-state">Chưa xác định kết quả pha</span>
                </li>
              ))}
            </ol>
            <div className="agent-sec"><ShieldCheck size={19} aria-hidden="true" /><span><strong>SEC · Kiểm tra quyền và chính sách</strong> — trạng thái phê duyệt: {run?.approval.state === 'PENDING_HUMAN' ? 'Cần người có thẩm quyền' : 'Chưa có quyết định được ghi nhận'}.</span></div>
          </Section>

          <Section eyebrow="03 / ACT • OBS • ANM • REP" title="Chứng cứ thực thi và phân tích" id="agent-tools">
            <h3 className="agent-subheading">ACT · Lời gọi công cụ</h3>
            {run?.selectedTools.length ? (
              <div className="agent-table-scroll"><table className="agent-table"><caption className="sr-only">Các lời gọi công cụ đã được Backend công bố</caption>
                <thead><tr><th scope="col">Bước</th><th scope="col">Công cụ</th><th scope="col">Trạng thái</th><th scope="col">Thử lại / lý do</th></tr></thead>
                <tbody>{run.selectedTools.map((tool, index) =>
                  <tr key={index}><td>{tool.stepNo}</td><td><code>{tool.name}</code></td><td><AgentStatusPill type="tool" status={tool.status} /></td><td>Chưa được lưu công khai</td></tr>)}</tbody>
              </table></div>
            ) : <Unavailable>Không có lời gọi công cụ công khai cho run đã chọn.</Unavailable>}
            <p className="agent-footnote">Thời điểm, dependency, phân loại lỗi, nguyên nhân retry và audit ID theo từng attempt chưa được endpoint này cung cấp. Không hiển thị payload hoặc stack trace.</p>
            <div className="agent-evidence-grid">
              <div><h3>OBS · Quan sát nguồn</h3><Unavailable>Chưa có thông tin nguồn tồn kho, tính mới hoặc chất lượng dữ liệu được chứng thực.</Unavailable></div>
              <div><h3>ANM · Cảnh báo bất thường</h3><Unavailable>Chưa có mã bất thường và mức nghiêm trọng cho run qua API hiện tại.</Unavailable></div>
              <div><h3>REP · Lập lại kế hoạch</h3><Unavailable>Chưa có kế hoạch gốc, thay đổi giả định, phiên bản nguồn hoặc kế hoạch đề xuất.</Unavailable></div>
              <div><h3>EXP · Lý do quyết định</h3><Unavailable>Chưa có reason codes và evidence provenance; không suy diễn từ status.</Unavailable></div>
            </div>
            {run?.dataQualityStatus === 'NOT_RECORDED' && <p className="agent-warning"><AlertCircle size={16} />Chất lượng dữ liệu chưa được lưu trong bản tóm tắt.</p>}
          </Section>
        </div>

        <div className="agent-side-column">
          <Section eyebrow="04 / ROLE & SAFETY" title="Quyền và bước tiếp theo">
            <div className="agent-policy"><LockKeyhole size={21} aria-hidden="true" /><div>
              <strong>{isAdmin ? 'Quyền ADMIN' : 'Quyền STAFF'}</strong>
              <p>{isAdmin ? 'Có thể tra cứu run do mình kích hoạt; phê duyệt phải thông qua Backend riêng.' :
                'Chỉ xem nhật ký và yêu cầu mua hàng được Backend cho phép. Không có quyền xem run summary.'}</p>
            </div></div>
            <p className="agent-intro">Màn hình này luôn chỉ đọc. Không có nút tự phê duyệt, chạy lại công cụ hoặc liên hệ nhà cung cấp.</p>
            <Link className="agent-text-link" to="/admin/purchase-requests">Đến quy trình yêu cầu nhập <ArrowRight size={15} /></Link>
          </Section>
          <Section eyebrow="05 / PURCHASING" title="Yêu cầu nhập hàng do AI tạo">
            {purchasingLoading ? <p className="agent-loading" role="status">Đang tải yêu cầu nhập…</p> :
              purchasingError ? <p className="agent-error" role="alert">{purchasingError}</p> :
              requests.length ? <ul className="agent-pr-list">{requests.map(pr => (
                <li key={pr.id}><Link to={'/admin/purchase-requests/' + encodeURIComponent(pr.id)}>
                  <strong>{pr.requestNumber || 'Yêu cầu ' + pr.id.slice(0, 8)}</strong><ExternalLink size={14} />
                </Link><span>Trạng thái Backend: {pr.status}</span>
                  <small>{pr.status === 'PENDING' ? 'Đề xuất đang chờ xét, chưa được phê duyệt.' : 'Kiểm tra chi tiết để xác nhận quyền và nghiệp vụ.'}</small>
                </li>
              ))}</ul> : <Unavailable>Chưa có yêu cầu được đánh dấu aiGenerated từ API.</Unavailable>}
            <p className="agent-footnote">Thiếu hụt định lượng, hàng đang về và bằng chứng xác minh nhà cung cấp chưa có trong bản tóm tắt run; xem dữ liệu nghiệp vụ tại trang nhập hàng.</p>
            <Link className="agent-text-link" to="/admin/purchasing">Đơn mua & đối soát <ArrowRight size={15} /></Link>
          </Section>
          <Section eyebrow="06 / CONTEXT" title="Đối chiếu tồn kho">
            <div className="agent-crosslinks">
              <Link to="/admin/ingredients">Nguyên liệu và mức tồn <ArrowRight size={15} /></Link>
              <Link to="/admin/ingredient-batches">Lô nguyên liệu <ArrowRight size={15} /></Link>
              <Link to="/admin/stocktakes">Phiên kiểm kê <ArrowRight size={15} /></Link>
            </div>
            <p className="agent-footnote">Đây là đường dẫn tới trang nghiệp vụ có thật, không phải dữ liệu tồn kho trực tiếp của run Agent.</p>
          </Section>
        </div>
      </div>

      <Section eyebrow="07 / AUDIT & HISTORY" title="Nhật ký Agent được cấp quyền" id="agent-history">
        <div className="agent-history-head"><p>Tải trang lịch sử qua Backend; chỉ hiển thị mã hành động, trạng thái và tham chiếu công khai.</p>
          <button type="button" className="agent-outline" onClick={() => setAuditRefresh(n => n + 1)} disabled={auditLoading}>
            <RefreshCw size={15} aria-hidden="true" /> Làm mới</button></div>
        {auditLoading ? <p className="agent-loading" role="status">Đang lấy nhật ký…</p> :
          auditError ? <p className="agent-error" role="alert"><AlertCircle size={16} />{auditError}</p> :
          !audit?.logs.length ? <Unavailable>Không có nhật ký phù hợp hoặc Backend trả về danh sách trống.</Unavailable> :
          <div className="agent-table-scroll"><table className="agent-table"><caption className="sr-only">Nhật ký theo quyền của tài khoản hiện tại</caption>
            <thead><tr><th scope="col">Thời gian</th><th scope="col">Hành động</th><th scope="col">Kết quả</th><th scope="col">Lý do / PR</th></tr></thead>
            <tbody>{audit.logs.map(log => <tr key={log.id}>
              <td><Clock3 size={13} aria-hidden="true" /> {dateText(log.createdAt)}</td><td><code>{log.action}</code></td>
              <td><AgentStatusPill status={log.status} type="audit" /> <small>{log.result || '—'}</small></td>
              <td>{log.reason || 'Chưa có mã lý do'}{log.purchaseRequestId &&
                <Link to={'/admin/purchase-requests/' + encodeURIComponent(log.purchaseRequestId)}> Xem PR</Link>}</td>
            </tr>)}</tbody>
          </table></div>}
        <nav className="agent-pager" aria-label="Phân trang nhật ký">
          <button type="button" className="agent-outline" onClick={() => setAuditPage(p => Math.max(1, p - 1))}
            disabled={auditLoading || auditPage === 1}>Trang trước</button>
          <span>Trang {auditPage}{audit?.pagination ? ' / ' + audit.pagination.totalPages : ''}</span>
          <button type="button" className="agent-outline" onClick={() => setAuditPage(p => p + 1)}
            disabled={auditLoading || !audit || (audit.pagination ? auditPage >= audit.pagination.totalPages : audit.logs.length < 12)}>Trang sau</button>
        </nav>
        <p className="agent-footnote">Checkpoint, replay, retry chi tiết và lịch sử Graph chưa được API public cung cấp. Không hiển thị dữ liệu actor khác ngoài phạm vi Backend cho phép.</p>
      </Section>
    </div>
  );
};

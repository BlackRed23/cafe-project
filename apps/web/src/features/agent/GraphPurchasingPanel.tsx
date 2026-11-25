import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { graphPurchasingApi, type GraphPurchaseProposal, type GraphPurchaseReview, type PurchasingGraph } from '../../api/graphPurchasing.api';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { AgentStatusPill } from './AgentStatusPill';

const decisionLabels = {
  PENDING_APPROVAL: 'Chờ phê duyệt',
  APPROVED_AWAITING_BACKEND: 'Đã phê duyệt · chờ tạo yêu cầu',
  REJECTED: 'Đã từ chối',
  EXECUTED: 'Đã tạo yêu cầu mua hàng',
};
const dateText = (date: string) => new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short', timeStyle: 'short',
}).format(new Date(date));

function errorText(error: unknown) {
  const response = (error as { response?: { status?: number; data?: { code?: string; message?: string } } })?.response;
  const code = response?.data?.code ?? response?.data?.message;
  if (response?.status === 403) return 'Bạn không có quyền phê duyệt đề xuất này.';
  if (response?.status === 404) return 'Không tìm thấy đề xuất.';
  if (code === 'STALE_INVENTORY_REVIEW_REQUIRED' || code === 'AI_LN_STALE_SOURCE') {
    return 'Dữ liệu tồn kho đã thay đổi. Hệ thống cần đánh giá lại.';
  }
  if (code === 'GRAPH_LINEAGE_UNAVAILABLE') return 'Chưa xác minh được phiên chạy Graph. Vui lòng tải lại dữ liệu.';
  if (response?.status === 409) return 'Đề xuất đã thay đổi. Vui lòng tải lại dữ liệu.';
  return 'Không nhận được xác nhận từ hệ thống. Vui lòng tải lại để kiểm tra trạng thái mới nhất.';
}

function RequestLink({ request }: { request: GraphPurchaseProposal['purchaseRequest'] }) {
  return request ? <Link className="agent-text-link" to={`/admin/purchase-requests/${encodeURIComponent(request.id)}`}>
    {request.requestNumber}
  </Link> : 'Chưa tạo';
}

function GraphState({ graph }: { graph: PurchasingGraph }) {
  return <><AgentStatusPill status={graph.status} />
    {graph.node && <small>{graph.node} · {graph.lastEvent}</small>}
    {graph.purchaseRequestVerified && graph.lastEvent !== 'PR_VERIFIED' && <small>PR_VERIFIED</small>}
    {graph.warning && <small>{graph.warning}</small>}
  </>;
}

export function GraphPurchasingPanel({ selectedId, select }: { selectedId: string; select: (id: string) => void }) {
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [response, setResponse] = useState<{
    page: number;
    data?: Awaited<ReturnType<typeof graphPurchasingApi.list>>;
    error?: string;
  } | null>(null);
  const data = response?.page === page ? response.data : undefined;
  const error = response?.page === page ? response.error : undefined;

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const data = await graphPurchasingApi.list(page);
        if (active) setResponse({ page, data });
      } catch (error) {
        if (active) setResponse({ page, error: errorText(error) });
      } finally {
        if (active) timer = setTimeout(load, 15000);
      }
    };
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [page, refresh]);

  return <section className="agent-panel" aria-labelledby="graph-purchasing-title">
    <div className="agent-record-head">
      <h2 id="graph-purchasing-title">Đề xuất mua hàng của Agent</h2>
      <button className="agent-outline" onClick={() => setRefresh(value => value + 1)}>Tải lại danh sách</button>
    </div>
    {error && <p className="agent-error" role="alert">{error}</p>}
    {!data && !error && <p role="status" className="agent-loading">Đang tải đề xuất…</p>}
    {data && <>
      {!data.proposals.length ? <p className="agent-unavailable">Chưa có đề xuất mua hàng trên trang này.</p> :
        <div className="agent-table-scroll"><table className="agent-table">
          <thead><tr><th>Nguyên liệu / Đề xuất</th><th>Số lượng</th><th>Tồn kho / Mục tiêu</th><th>Phiên bản</th><th>Trạng thái đề xuất</th><th>Yêu cầu mua hàng</th></tr></thead>
          <tbody>{data.proposals.map(proposal => <tr key={proposal.proposalId}>
            <td>
              <button className="agent-outline" aria-pressed={selectedId === proposal.graphId} onClick={() => select(proposal.graphId)}>
                {proposal.ingredientName ?? proposal.ingredientId ?? 'Xem đề xuất'}
              </button>
              <small>{proposal.proposalId}</small><small>{dateText(proposal.createdAt)}</small>
            </td>
            <td>{proposal.quantity} {proposal.unit}</td>
            <td>{proposal.confirmedStock ? <>
              {proposal.confirmedStock.availableBase} / {proposal.confirmedStock.targetBase} {proposal.baseUnit}
              <small>Thiếu {proposal.confirmedStock.shortageBase} {proposal.baseUnit} so với mục tiêu</small>
            </> : 'Xem chi tiết'}</td>
            <td>{proposal.version}</td>
            <td>{decisionLabels[proposal.status]}</td>
            <td><RequestLink request={proposal.purchaseRequest} /></td>
          </tr>)}</tbody>
        </table></div>}
      {(page > 1 || data.hasNextPage) && <div className="agent-input-row">
        <button className="agent-outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Trang trước</button>
        <button className="agent-outline" disabled={!data.hasNextPage} onClick={() => setPage(page + 1)}>Trang sau</button>
      </div>}
    </>}
    {selectedId && <ProposalReview key={selectedId} graphId={selectedId} onDecision={() => setRefresh(value => value + 1)} />}
    <h3 className="agent-subheading">Phiên chạy Graph gần đây</h3>
    {data && !data.graphs.length && <p className="agent-unavailable">Chưa ghi nhận phiên chạy mua hàng.</p>}
    {!!data?.graphs.length && <div className="agent-table-scroll"><table className="agent-table">
      <thead><tr><th>Graph</th><th>Trạng thái</th><th>Cập nhật</th><th>Yêu cầu mua hàng</th></tr></thead>
      <tbody>{data.graphs.map(graph => <tr key={graph.graphId}>
        <td>{graph.proposalId ? <button className="agent-outline" onClick={() => select(graph.graphId)}>
          Xem đề xuất
        </button> : null}<small>{graph.graphId}</small></td>
        <td><GraphState graph={graph} /></td>
        <td>{dateText(graph.updatedAt)}</td>
        <td>{graph.purchaseRequestId && <Link to={`/admin/purchase-requests/${encodeURIComponent(graph.purchaseRequestId)}`}>Xem yêu cầu</Link>}</td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}

function ProposalReview({ graphId, onDecision }: { graphId: string; onDecision: () => void }) {
  const [review, setReview] = useState<GraphPurchaseReview | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [confirmation, setConfirmation] = useState<GraphPurchaseReview | null>(null);
  const mutation = useRef(false);
  const pending = Boolean(review?.continuationPending);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const data = await graphPurchasingApi.review(graphId);
        if (active && !mutation.current) {
          setReview(data);
          setError('');
        }
      } catch (error) {
        if (active && !mutation.current) setError(errorText(error));
      } finally {
        if (active && pending) timer = setTimeout(load, 4000);
      }
    };
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [graphId, refresh, pending]);

  const decide = async (decision: 'approve' | 'reject', reviewed: GraphPurchaseReview) => {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await graphPurchasingApi.decide(graphId, reviewed, decision, reason.trim());
      setMessage(decision === 'approve' ? 'Đề xuất đã được phê duyệt.' : 'Đề xuất đã được từ chối.');
      setReview(null);
      setRefresh(value => value + 1);
      onDecision();
    } catch (error) {
      setError(errorText(error));
    } finally {
      mutation.current = false;
      setBusy(false);
      setConfirmation(null);
    }
  };

  const calculation = review?.evidence?.calculation;
  return <section className="agent-run-summary" aria-labelledby="graph-proposal-title" aria-busy={busy}>
    <div className="agent-record-head">
      <h3 id="graph-proposal-title">Chi tiết đề xuất</h3>
      <button className="agent-outline" disabled={busy} onClick={() => {
        setReview(null);
        setError('');
        setMessage('');
        setRefresh(value => value + 1);
      }}>Tải lại đề xuất</button>
    </div>
    {message && <p role="status">{message}</p>}
    {error && <p className="agent-error" role="alert">{error}</p>}
    {!review && !error && <p role="status" className="agent-loading">Đang tải chi tiết…</p>}
    {review && <>
      <dl className="agent-facts">
        <div><dt>Nguyên liệu</dt><dd>{review.ingredientName ?? review.ingredientId ?? 'Chưa ghi nhận'}</dd></div>
        <div><dt>Số lượng đề xuất</dt><dd>{review.quantity} {review.unit} · {review.unitsPerPack} {review.baseUnit}/{review.unit}</dd></div>
        <div><dt>Đề xuất</dt><dd>{review.proposalId} · Phiên bản {review.version}</dd></div>
        <div><dt>Mã kiểm tra nội dung</dt><dd><code>{review.contentHash}</code></dd></div>
        <div><dt>Nhà cung cấp</dt><dd>{review.supplierName ?? review.supplierId} · Chưa xác minh khả năng cung ứng</dd></div>
        <div><dt>Đơn giá theo quy cách mua</dt><dd>{review.unitPrice}</dd></div>
        <div><dt>Trạng thái đề xuất</dt><dd>{decisionLabels[review.status]}</dd></div>
        <div><dt>Yêu cầu mua hàng</dt><dd><RequestLink request={review.purchaseRequest} /></dd></div>
        <div><dt>Graph</dt><dd>{review.graphId}</dd></div>
        <div><dt>Trạng thái Graph</dt><dd>{review.graph ? <GraphState graph={review.graph} /> : 'Chưa xác minh'}{review.graph &&
          <p>Cập nhật {dateText(review.graph.updatedAt)}</p>}</dd></div>
        {calculation && <>
          <div><dt>Tồn khả dụng đã xác minh tại thời điểm phân tích</dt><dd>{calculation.stockBase} {review.baseUnit}</dd></div>
          <div><dt>Lý do đề xuất</dt><dd>Lượng tồn khả dụng thấp hơn mức tồn mục tiêu</dd></div>
          <div><dt>Mức tồn mục tiêu / lượng thiếu</dt><dd>{calculation.targetBase} / {calculation.shortageBase} {review.baseUnit}</dd></div>
          {calculation.purchaseBase !== null && <div><dt>Lượng mua sau quy đổi</dt><dd>{calculation.purchaseBase} {review.baseUnit}</dd></div>}
          <div><dt>Nguồn bằng chứng</dt><dd>Nhật ký phân tích của Graph · {dateText(review.evidence!.calculatedAt)}</dd></div>
        </>}
        {review.source && <div><dt>Phiên bản nguồn tồn kho</dt><dd>{review.source.rowVersion} · Mốc biến động {review.source.movementCursor} · {review.source.policy}</dd></div>}
        {review.demand && <div><dt>Nhu cầu ghi nhận khi tải đề xuất</dt><dd>{review.demand.dailyRate} {review.baseUnit}/ngày · {review.demand.observedMovements} biến động · {dateText(review.demand.asOf)}</dd></div>}
      </dl>
      {review.evidence?.warnings.length ? <p className="agent-warning">Cảnh báo chính sách · {review.evidence.warnings.join(', ')}</p> : null}
      {review.demand?.sourceChanged && <p className="agent-warning">Dữ liệu tồn kho đã thay đổi. Hệ thống cần đánh giá lại.</p>}
      {!calculation && <p className="agent-unavailable">Chưa ghi nhận bằng chứng tính toán cho phiên bản này.</p>}
      {pending && <p role="status" className="agent-loading">Đề xuất đang được xử lý. Trạng thái tự động cập nhật.</p>}
      <h4 className="agent-subheading">Lịch sử xét duyệt</h4>
      <ul className="agent-pr-list">{review.history.map(entry => <li key={entry.version}>
        Phiên bản {entry.version} · Tạo lúc {dateText(entry.createdAt)}
        {entry.approvedAt && <span>Phê duyệt {dateText(entry.approvedAt)} · ADMIN {entry.approvedById}</span>}
        {entry.rejectedAt && <span>Từ chối {dateText(entry.rejectedAt)} · ADMIN {entry.rejectedById} · {entry.rejectionReason}</span>}
      </li>)}</ul>
      {review.status === 'PENDING_APPROVAL' && review.reviewable && review.graph?.status === 'AWAITING_APPROVAL' &&
        <form className="agent-composer" onSubmit={event => {
          event.preventDefault();
          if (!busy && !error && reason.trim().length >= 3) void decide('reject', review);
        }}>
          <label htmlFor="graph-reject-reason">Lý do từ chối</label>
          <textarea id="graph-reject-reason" value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} />
          <div className="agent-input-row">
            <button type="button" disabled={busy || Boolean(error)} onClick={() => setConfirmation(review)}>Phê duyệt</button>
            <button className="agent-outline" disabled={busy || Boolean(error) || reason.trim().length < 3}>Từ chối đề xuất</button>
          </div>
        </form>}
    </>}
    <ConfirmDialog isOpen={Boolean(confirmation)} isLoading={busy}
      onClose={() => { if (!mutation.current) setConfirmation(null); }}
      onConfirm={() => confirmation ? decide('approve', confirmation) : undefined}
      title="Phê duyệt đề xuất mua hàng?"
      message={confirmation ? `Xác nhận phiên bản ${confirmation.version}, số lượng ${confirmation.quantity} ${confirmation.unit}.` : ''}
      confirmText="Xác nhận phê duyệt" />
  </section>;
}

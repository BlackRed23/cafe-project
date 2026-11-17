import { useRef, useState } from 'react';
import { ingredientBatchesApi } from '../../api/ingredient-batches.api';
import type { LotTrace, LotReturnPayload, LotTransitionPayload, LotEvent } from '../../types/ingredient-batch.types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Alert } from '../../components/common/Alert';
import { keepLotIntent, lotDate, lotError, lotNumber, returnCapacity, validReturnQuantity } from './lotFeedback';

type Action = 'quarantine' | 'recall' | 'return';
type Intent = { action: Action; payload: LotTransitionPayload | LotReturnPayload };
export function LotOperations({ ingredientId, trace, onRefresh }: { ingredientId: string; trace: LotTrace; onRefresh: () => Promise<void> }) {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [quality, setQuality] = useState<LotReturnPayload['quality']>('UNKNOWN');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [requestId, setRequestId] = useState('');
  const [error, setError] = useState('');
  const [audit, setAudit] = useState<LotEvent | null>(null);
  const [receipt, setReceipt] = useState('');
  const [review, setReview] = useState('');
  const lock = useRef(false);
  const intent = useRef<Intent | null>(null);
  const eligible = trace.outbound.filter(t => t.ingredientId === ingredientId && t.batchId === trace.batch.id && returnCapacity(t, trace.returns) > 0);
  const source = eligible.find(t => t.id === sourceId);
  function open(next: Action) {
    setAction(next); setError(''); setReason(''); setSourceId(''); setQuantity(''); setQuality('UNKNOWN'); setConfirmed(false);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || !action) return;
    if (!isAdmin) { setError('Bạn không có quyền thực hiện thao tác này. Cần tài khoản ADMIN.'); return; }
    if (!intent.current) {
      if (!reason.trim() || reason.trim().length > 1000) { setError('Vui lòng nhập lý do từ 1 đến 1000 ký tự.'); return; }
      if (!confirmed) { setError('Vui lòng xác nhận tác động trước khi gửi.'); return; }
      if (action === 'return' && (!source || !validReturnQuantity(quantity, returnCapacity(source, trace.returns)))) {
        setError('Số lượng hoàn không hợp lệ hoặc vượt lượng chưa hoàn; tối đa 3 chữ số thập phân.'); return;
      }
      const base = { requestId: crypto.randomUUID(), reason: reason.trim() };
      setRequestId(base.requestId);
      intent.current = { action, payload: action === 'return' ? { ...base, sourceTransactionId: source!.id, batchId: trace.batch.id, quantity: Number(quantity), quality } : base };
    }
    lock.current = true; setBusy(true); setError('');
    try {
      const current = intent.current;
      if (current.action === 'return') {
        const result = await ingredientBatchesApi.returnLot(ingredientId, current.payload as LotReturnPayload);
        setReceipt(`Hoàn ${lotNumber(result.return.quantity)} vào lô cách ly ${result.return.targetBatchId}. Mã: ${result.return.requestId}. Người ghi nhận: ${result.return.actorId}. ${lotDate(result.return.createdAt)}. Lý do: ${result.return.reason}`);
        toast.success(result.replayed ? 'Yêu cầu hoàn đã ghi nhận trước đó; không cộng tồn lần nữa.' : 'Đã nhận hoàn. Hàng luôn được CÁCH LY, chưa dùng để bán.');
      } else {
        const result = await ingredientBatchesApi.transitionLot(ingredientId, trace.batch.id, current.action, current.payload);
        setAudit(result.event);
        toast.success(result.replayed ? 'Thao tác đã ghi nhận trước đó; lịch sử được giữ nguyên.' : current.action === 'recall' ? 'Đã xác nhận thu hồi lô.' : 'Đã xác nhận cách ly lô.');
      }
      intent.current = null; setUncertain(false); setAction(null);
      try { await onRefresh(); } catch { toast.info('Thao tác đã thành công; chưa tải lại được dữ liệu. Vui lòng tải lại.'); }
    } catch (e) {
      setError(lotError(e));
      const retain = keepLotIntent(e); setUncertain(retain);
      if (!retain) intent.current = null;
    } finally { lock.current = false; setBusy(false); }
  }
  return <section className="lot-operations">
    {isAdmin ? <div className="lot-actions"><Button variant="outline" onClick={() => open('quarantine')} disabled={trace.batch.qualityStatus === 'RECALLED'}>Cách ly lô</Button><Button variant="outline" onClick={() => open('recall')} disabled={trace.batch.qualityStatus === 'RECALLED'}>Thu hồi lô</Button><Button onClick={() => open('return')} disabled={!eligible.length}>Nhận hoàn từ giao dịch gốc</Button></div> : <Alert>Chỉ ADMIN được cách ly, thu hồi và nhận hoàn.</Alert>}
    <p className="lot-note">Không hỗ trợ xóa lô; mọi lịch sử được giữ nguyên. Không có thao tác giải phóng cách ly hoặc thu hồi.</p>
    {audit && <Alert tone="success" title="Đã ghi nhận sự kiện"><p>{audit.previousStatus} → {audit.newStatus} · {lotDate(audit.createdAt)}</p><p>{audit.reason} · Người thực hiện: {audit.actorId}</p><p>Mã thao tác: {audit.requestId}</p></Alert>}
    {receipt && <Alert tone="success">{receipt}</Alert>}
    {review && <Alert tone="warning">{review}</Alert>}
    <Modal isOpen={action !== null} onClose={() => { if (!busy && !uncertain) setAction(null); }} title={action === 'return' ? 'Nhận hoàn về khu cách ly' : action === 'recall' ? 'Xác nhận thu hồi lô' : 'Xác nhận cách ly lô'} size="lg">
      <form className="lot-form" onSubmit={submit} noValidate>
        <p>Lô <strong>{trace.batch.batchCode}</strong>. Cách ly / thu hồi giữ nguyên tồn vật lý và chặn sử dụng. Hoàn hàng tạo lô cách ly riêng có liên kết nguồn.</p>
        {error && <Alert tone="danger">{error}</Alert>}
        {uncertain && <Alert tone="warning"><p>Nội dung và mã thao tác được giữ nguyên để thử lại an toàn.</p><code>{requestId}</code><Button type="button" variant="outline" disabled={busy} onClick={async () => { try { await onRefresh(); toast.info('Đã tải lại truy xuất. Đối chiếu lịch sử và mã thao tác.'); } catch (e) { setError(lotError(e)); } }}>Tải lại truy xuất để đối chiếu</Button><p>Đóng yêu cầu chỉ sau khi đã xác minh kết quả; không tự gửi bằng mã mới.</p><Button type="button" variant="outline" disabled={busy} onClick={() => { if (intent.current) setReview(`Yêu cầu cần đối chiếu: ${intent.current.payload.requestId}. ${intent.current.payload.reason}`); intent.current = null; setUncertain(false); setAction(null); }}>Đã đối chiếu — đóng yêu cầu</Button></Alert>}
        {action === 'return' && <><label>Giao dịch CONSUME nguồn<select required value={sourceId} disabled={busy || uncertain} onChange={e => setSourceId(e.target.value)}><option value="">Chọn giao dịch gốc</option>{eligible.map(t => <option key={t.id} value={t.id}>{t.id} · {lotDate(t.createdAt)} · Còn được hoàn {lotNumber(returnCapacity(t, trace.returns))}</option>)}</select></label><Input label="Số lượng hoàn (đơn vị chuẩn)" type="number" min="0.001" step="0.001" required value={quantity} disabled={busy || uncertain} onChange={e => setQuantity(e.target.value)} /><label>Kết quả kiểm tra chất lượng<select value={quality} disabled={busy || uncertain} onChange={e => setQuality(e.target.value as LotReturnPayload['quality'])}><option value="UNKNOWN">Chưa xác minh</option><option value="UNSAFE">Không đạt</option><option value="SAFE">Đã kiểm tra đạt — vẫn cách ly</option></select></label><Alert tone="warning">Mọi hàng hoàn đều QUARANTINED. Khai báo đạt chất lượng không đưa hàng về tồn khả dụng.</Alert></>}
        <Input label="Lý do" required maxLength={1000} value={reason} disabled={busy || uncertain} onChange={e => setReason(e.target.value)} />
        <label className="lot-confirm"><input type="checkbox" checked={confirmed} disabled={busy || uncertain} onChange={e => setConfirmed(e.target.checked)} />Tôi đã đối chiếu lô, giao dịch và xác nhận tác động nêu trên.</label>
        <div className="lot-actions"><Button type="button" variant="outline" disabled={busy || uncertain} onClick={() => setAction(null)}>Hủy</Button><Button type="submit" disabled={busy || !confirmed} isLoading={busy}>{uncertain ? 'Thử lại cùng mã thao tác' : 'Xác nhận gửi'}</Button></div>
      </form>
    </Modal>
  </section>;
}

import { useRef, useState } from 'react';
import { ingredientsApi } from '../../api/ingredients.api';
import type { Ingredient, IngredientIncident, InternalUsagePayload } from '../../types/ingredient.types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { availableStock, ingredientError } from './ingredientFeedback';

export function IngredientOperations({ ingredient, onRefresh }: { ingredient: Ingredient; onRefresh: () => Promise<void> }) {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<'internal' | 'incident'>('incident');
  const [quantity, setQuantity] = useState('');
  const [purpose, setPurpose] = useState('');
  const [recipient, setRecipient] = useState('');
  const [lookup, setLookup] = useState('');
  const [incident, setIncident] = useState<IngredientIncident | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [approvalConfirmed, setApprovalConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const intent = useRef<InternalUsagePayload | null>(null);
  const [uncertain, setUncertain] = useState(false);
  async function execute(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { setError(ingredientError(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(quantity);
    if (!quantity || !Number.isFinite(amount) || amount < 0 || (mode === 'internal' && amount <= 0) || !purpose.trim() || !confirmed) {
      setError('Nhập số lượng hợp lệ, lý do và xác nhận thao tác.'); return;
    }
    if (mode === 'internal' && (!isAdmin || !recipient.trim() || amount > availableStock(ingredient))) {
      setError('Cần quyền ADMIN, người nhận và số lượng không vượt tồn khả dụng.'); return;
    }
    if (mode === 'incident' && (amount >= ingredient.quantity || Math.abs(amount * 1000 - Math.round(amount * 1000)) > 0.0001)) {
      setError('Tồn kiểm đếm phải thấp hơn tồn thực tế, tối đa 3 chữ số thập phân.'); return;
    }
    await execute(async () => {
      if (mode === 'internal') {
        intent.current ??= { requestId: crypto.randomUUID(), quantity: amount, unit: ingredient.baseUnit, purpose: purpose.trim(), recipient: recipient.trim() };
        setUncertain(true);
        let result;
        try { result = await ingredientsApi.internalUse(ingredient.id, intent.current); }
        catch (e) {
          const status = (e as { response?: { status?: number } }).response?.status;
          if (status && status >= 400 && status < 500 && status !== 409) { intent.current = null; setUncertain(false); }
          throw e;
        }
        toast.success(result.replayed ? 'Thao tác đã ghi nhận trước đó; không trừ tồn lần nữa.' : `Đã dùng nội bộ ${result.consumedQuantityBase} ${result.ingredient.baseUnit}.`);
        intent.current = null; setUncertain(false);
      } else {
        const result = await ingredientsApi.createIncident(ingredient.id, { actualQuantity: amount, reason: purpose.trim() });
        setIncident(result); setLookup(result.id); setApprovalConfirmed(false);
        toast.success('Đã ghi nhận PENDING. Tồn chính thức chưa thay đổi.');
      }
      setQuantity(''); setPurpose(''); setRecipient(''); setConfirmed(false);
      await onRefresh();
    });
  }
  return <section className="ingredient-operations" aria-labelledby="ingredient-ops-title">
    <header><span className="ingredients-eyebrow">Kiểm soát nghiệp vụ</span><h2 id="ingredient-ops-title">Sử dụng & kiểm đếm</h2><p>Khả dụng: {availableStock(ingredient).toLocaleString('vi-VN')} {ingredient.baseUnit} · Phiên bản {ingredient.rowVersion}</p></header>
    <div className="ingredient-actions">
      <Button variant="outline" disabled={busy || uncertain} onClick={() => { setMode('incident'); setConfirmed(false); }}>Ghi nhận thiếu / mất</Button>
      {isAdmin && <Button variant="outline" disabled={busy || uncertain} onClick={() => { setMode('internal'); setConfirmed(false); }}>Sử dụng nội bộ</Button>}
    </div>
    {error && <p className="ingredient-error" role="alert">{error}</p>}
    {uncertain && <p role="status">Giữ nguyên mã thao tác khi thử lại. Nội dung đã khóa để tránh trừ lặp. Kiểm tra lịch sử nếu chưa rõ kết quả.</p>}
    <form onSubmit={submit} className="ingredient-fields">
      <Input label={mode === 'internal' ? `Lượng sử dụng (${ingredient.baseUnit})` : `Tồn kiểm đếm (${ingredient.baseUnit})`} type="number" step="0.001" min={mode === 'internal' ? '0.001' : '0'} required value={quantity} disabled={busy || uncertain} onChange={e => setQuantity(e.target.value)} />
      <Input label={mode === 'internal' ? 'Mục đích sử dụng' : 'Lý do / bằng chứng thiếu hụt'} required maxLength={500} value={purpose} disabled={busy || uncertain} onChange={e => setPurpose(e.target.value)} />
      {mode === 'internal' && <Input label="Người nhận / bộ phận" required maxLength={200} value={recipient} disabled={busy || uncertain} onChange={e => setRecipient(e.target.value)} />}
      <label className="ingredient-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />{mode === 'internal' ? 'Xác nhận sử dụng nội bộ: sẽ trừ tồn và ghi sổ ngay.' : 'Xác nhận số kiểm đếm. Chỉ tạo PENDING, chưa trừ tồn.'}</label>
      <Button type="submit" disabled={busy || !confirmed} isLoading={busy}>{uncertain ? 'Thử lại cùng mã thao tác' : mode === 'internal' ? 'Xác nhận sử dụng' : 'Tạo phiếu chờ duyệt'}</Button>
    </form>
    <div className="ingredient-incident-lookup"><h3>Tra cứu phiếu kiểm đếm</h3><p>Nhập ID phiếu đã tạo để xem trạng thái.</p><Input label="ID phiếu" value={lookup} onChange={e => setLookup(e.target.value)} /><Button variant="outline" disabled={busy || !lookup.trim()} onClick={() => execute(async () => { setIncident(await ingredientsApi.getIncident(ingredient.id, lookup.trim())); setApprovalConfirmed(false); })}>Tra cứu</Button></div>
    {incident && <article className="ingredient-incident" aria-live="polite"><strong>{incident.code}</strong><p>ID: {incident.id}</p><p>{incident.status === 'PENDING' ? 'PENDING · Chờ ADMIN xác minh, tồn chính thức chưa đổi' : incident.status === 'COMPLETED' ? 'COMPLETED · Đã duyệt; không áp dụng lại' : incident.status}</p>{incident.items.map(item => <p key={item.id}>Sổ: {item.systemQty} · Kiểm đếm: {item.actualQty} · Chênh lệch: {item.varianceQty} {ingredient.baseUnit}</p>)}<p>{incident.note}</p>
      {isAdmin && incident.status === 'PENDING' && <label className="ingredient-confirm"><input type="checkbox" checked={approvalConfirmed} onChange={e => setApprovalConfirmed(e.target.checked)} />Tôi đã đối chiếu số kiểm đếm và xác nhận điều chỉnh tồn.</label>}
      {isAdmin && incident.status === 'PENDING' && <Button disabled={busy || !approvalConfirmed} onClick={() => execute(async () => {
        const latest = await ingredientsApi.getIncident(ingredient.id, incident.id);
        if (latest.status === 'COMPLETED') { setIncident(latest); toast.info('Phiếu đã duyệt; không trừ tồn lần nữa.'); return; }
        const result = await ingredientsApi.approveIncident(ingredient.id, incident.id); setIncident(result); setApprovalConfirmed(false); toast.success('Phiếu đã duyệt. Tải lại tồn và lịch sử đã xác nhận.'); await onRefresh();
      })}>Đã xác minh — duyệt điều chỉnh tồn</Button>}
    </article>}
  </section>;
}

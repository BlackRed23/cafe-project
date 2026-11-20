import { useEffect, useRef, useState } from 'react';
import { ingredientsApi } from '../../api/ingredients.api';
import type { Ingredient, IngredientTransaction, ReconciliationResult, StockCountRequest } from '../../types/ingredient.types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { ingredientError } from './ingredientFeedback';
import './inventory-verification.css';

const status = (error: unknown) => (error as { response?: { status?: number } })?.response?.status;
const pendingError = (error: unknown) => !status(error) || status(error)! >= 500 || status(error) === 408;
const countId = (count: StockCountRequest) => count.code.startsWith('ING-ADJUST-') ? count.code.slice('ING-ADJUST-'.length) : '';
const canCorrect = (tx: IngredientTransaction) =>
  !!tx.batchId && tx.quantity !== 0 &&
  ['IMPORT', 'CONSUME', 'WASTE', 'RETURN', 'ADJUSTMENT', 'DAMAGE'].includes(tx.type) &&
  tx.referenceType !== 'InventoryTransactionCorrection';

export function InventoryVerification({ ingredient, transactions, onRefresh }: {
  ingredient: Ingredient;
  transactions: IngredientTransaction[];
  onRefresh: () => Promise<void>;
}) {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [batchId, setBatchId] = useState('');
  const [measured, setMeasured] = useState('');
  const [reason, setReason] = useState('');
  const [lookup, setLookup] = useState('');
  const [count, setCount] = useState<StockCountRequest | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationResult | null>(null);
  const [correctionId, setCorrectionId] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [countLocked, setCountLocked] = useState(false);
  const [correctionLocked, setCorrectionLocked] = useState(false);
  const lock = useRef(false);
  const countIntent = useRef<{ requestId: string; batchId: string; measuredQuantity: number; reason: string } | null>(null);
  const correctionIntent = useRef<{ transactionId: string; requestId: string; reason: string } | null>(null);
  const selected = ingredient.batches?.find(batch => batch.id === batchId);

  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (e) { setError(ingredientError(e)); toast.error(ingredientError(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function loadReconciliation() {
    await run(async () => setReconciliation(await ingredientsApi.getReconciliation(ingredient.id)));
  }
  useEffect(() => {
    let active = true;
    ingredientsApi.getReconciliation(ingredient.id)
      .then(result => { if (active) setReconciliation(result); })
      .catch(() => { if (active) setError('Không tải được đối soát. Chọn “Tải đối soát” để thử lại.'); });
    return () => { active = false; };
  }, [ingredient.id]);

  async function submitCount(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !confirmed) return;
    const value = Number(measured);
    if (!countIntent.current && (!selected || measured.trim() === '' || !Number.isFinite(value) || value < 0 || Math.abs(value * 1000 - Math.round(value * 1000)) > 0.0001 || !reason.trim())) {
      setError('Chọn lô, nhập số đo không âm (tối đa 3 số thập phân) và lý do.'); return;
    }
    countIntent.current ??= { requestId: crypto.randomUUID(), batchId, measuredQuantity: value, reason: reason.trim() };
    setCountLocked(true);
    const payload = countIntent.current;
    await run(async () => {
      try {
        if (uncertain) {
          try {
            const existing = await ingredientsApi.getAdjustment(ingredient.id, payload.requestId);
            setCount(existing); setLookup(payload.requestId); setUncertain(false); countIntent.current = null;
            setCountLocked(false);
            toast.info('Phiếu đã tồn tại. Đã đối soát theo mã yêu cầu.');
            return;
          } catch (e) { if (status(e) !== 404) throw e; }
        }
        const result = await ingredientsApi.createAdjustment(ingredient.id, payload);
        if (!result.request?.id) throw new Error('Unconfirmed adjustment response');
        setCount(result.request); setLookup(payload.requestId);
        setUncertain(false); countIntent.current = null; setConfirmed(false);
        setCountLocked(false);
        toast.success('Đã tạo phiếu kiểm kê. Đang chờ ADMIN phê duyệt.');
        await onRefresh();
      } catch (e) {
        if (pendingError(e)) setUncertain(true);
        else { countIntent.current = null; setUncertain(false); setCountLocked(false); }
        throw e;
      }
    });
  }
  async function findCount() {
    if (!lookup.trim()) return;
    await run(async () => {
      const result = await ingredientsApi.getAdjustment(ingredient.id, lookup.trim());
      setCount(result); toast.info('Đã tải trạng thái phiếu kiểm kê.');
    });
  }
  async function decide(approve: boolean) {
    if (!count || !confirmed || !isAdmin) return;
    const id = countId(count);
    if (!id) { setError('Không xác định được mã yêu cầu kiểm kê.'); return; }
    await run(async () => {
      const result = approve
        ? (await ingredientsApi.approveAdjustment(ingredient.id, id)).request
        : await ingredientsApi.rejectAdjustment(ingredient.id, id);
      if (!result?.id) throw new Error('Unconfirmed approval response');
      setCount(result); setConfirmed(false);
      toast.success(approve ? 'Đã duyệt phiếu kiểm kê và cập nhật tồn kho.' : 'Đã từ chối phiếu kiểm kê. Tồn kho không thay đổi.');
      await onRefresh();
      setReconciliation(await ingredientsApi.getReconciliation(ingredient.id));
    });
  }
  async function correct(event: React.FormEvent) {
    event.preventDefault();
    if (!isAdmin || busy || !confirmed || !correctionId || !correctionReason.trim()) return;
    correctionIntent.current ??= { transactionId: correctionId, requestId: crypto.randomUUID(), reason: correctionReason.trim() };
    setCorrectionLocked(true);
    const intent = correctionIntent.current;
    await run(async () => {
      try {
        const result = await ingredientsApi.correctTransaction(ingredient.id, intent.transactionId, {
          requestId: intent.requestId, reason: intent.reason,
        });
        if (!result.transaction?.id) throw new Error('Unconfirmed correction response');
        correctionIntent.current = null; setCorrectionId(''); setCorrectionReason(''); setConfirmed(false);
        setCorrectionLocked(false);
        toast.success(result.replayed ? 'Bút toán đảo đã tồn tại, không ghi trùng.' : 'Đã tạo bút toán đảo riêng biệt. Giao dịch gốc được giữ nguyên.');
        await onRefresh();
        setReconciliation(await ingredientsApi.getReconciliation(ingredient.id));
      } catch (e) {
        if (!pendingError(e) && status(e) !== 409) { correctionIntent.current = null; setCorrectionLocked(false); }
        throw e;
      }
    });
  }

  return <section className="inventory-verification" aria-label="Kiểm kê và đối soát kho">
    <div className="iv-heading"><div><span>KIỂM SOÁT KHO / THEO LÔ</span><h2>Kiểm kê & đối soát</h2><p>Tồn vật lý, lô và sổ kho được đối chiếu bởi máy chủ. Không tự động điều chỉnh.</p></div>
      <button type="button" disabled={busy} onClick={loadReconciliation}>Tải đối soát</button></div>
    {error && <p role="alert" className="iv-error">{error}</p>}
    <div className="iv-summary">
      {[
        ['Tồn vật lý', ingredient.physicalQuantity ?? ingredient.quantity],
        ['Tồn sử dụng được', ingredient.usableQuantity],
        ['Đã giữ chỗ', ingredient.reserved],
        ['Tồn khả dụng', ingredient.availableQuantity],
      ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value == null ? 'Chưa có dữ liệu' : Number(value).toLocaleString('vi-VN') + ' ' + ingredient.baseUnit}</strong></div>)}
    </div>
    <div className="iv-grid">
      <article className="iv-panel"><h3>Phiếu kiểm kê theo lô</h3><p>Số đo chỉ tạo phiếu PENDING; tồn kho chưa thay đổi cho đến khi ADMIN duyệt.</p>
        <form onSubmit={submitCount} className="iv-form">
          <label>Lô nguyên liệu<select required disabled={busy || countLocked} value={batchId} onChange={e => setBatchId(e.target.value)}>
            <option value="">Chọn lô</option>{ingredient.batches?.map(b => <option key={b.id} value={b.id}>{b.batchCode} — {b.quantityRemaining} {ingredient.baseUnit}</option>)}
          </select></label>
          {selected && <p>Tồn lô hiện tại: {selected.quantityRemaining} {ingredient.baseUnit}; chênh lệch dự kiến: {measured.trim() && Number.isFinite(Number(measured)) ? (Number(measured) - selected.quantityRemaining).toLocaleString('vi-VN') : '—'} {ingredient.baseUnit}. Đây chỉ là ước tính.</p>}
          <label>Số lượng thực đo<input required min="0" step="0.001" type="number" disabled={busy || countLocked} value={measured} onChange={e => setMeasured(e.target.value)} /></label>
          <label>Lý do<input required maxLength={1000} disabled={busy || countLocked} value={reason} onChange={e => setReason(e.target.value)} /></label>
          <label className="iv-check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy} /> Tôi xác nhận số kiểm đếm</label>
          {uncertain && <p role="status">Chưa rõ kết quả. Giữ nguyên mã và nội dung; lần thử tiếp theo tra cứu phiếu trước khi gửi lại.</p>}
          <button disabled={busy || !confirmed} type="submit">{busy ? 'Đang xử lý…' : uncertain ? 'Đối soát yêu cầu cũ' : 'Gửi phiếu chờ duyệt'}</button>
        </form>
        <div className="iv-form"><label>Mã yêu cầu (UUID)<input value={lookup} onChange={e => setLookup(e.target.value)} placeholder="Tra cứu phiếu đã gửi" /></label><button type="button" disabled={busy || !lookup.trim()} onClick={findCount}>Tra cứu</button></div>
        {count && <div className="iv-record"><strong>{count.code}</strong><p>Trạng thái: {count.status === 'PENDING' ? 'Chờ ADMIN duyệt' : count.status === 'COMPLETED' ? 'Đã duyệt' : count.status === 'CANCELLED' ? 'Đã từ chối' : count.status}</p>
          {count.items.map(item => <p key={item.id}>Tồn sổ: {item.systemQty} · Tồn điều chỉnh dự kiến: {item.actualQty} · Chênh lệch: {item.varianceQty} {ingredient.baseUnit}</p>)}
          {isAdmin && count.status === 'PENDING' && <div className="iv-actions"><button disabled={busy || !confirmed} onClick={() => decide(true)}>Duyệt và áp dụng</button><button disabled={busy || !confirmed} onClick={() => decide(false)}>Từ chối, không đổi tồn</button></div>}
        </div>}
      </article>
      <article className="iv-panel"><h3>Đối soát độc lập</h3>{reconciliation ? <>
        <dl className="iv-totals"><div><dt>Tồn vật lý</dt><dd>{reconciliation.physicalQuantity}</dd></div><div><dt>Tổng các lô</dt><dd>{reconciliation.batchQuantity}</dd></div><div><dt>Chênh lệch tổng – lô</dt><dd>{reconciliation.aggregateBatchDifference}</dd></div><div><dt>Chênh lệch sổ giao dịch</dt><dd>{reconciliation.ledgerBalanceDifference}</dd></div><div><dt>Số giao dịch vật lý</dt><dd>{reconciliation.movementCount}</dd></div></dl>
        <p>{reconciliation.aggregateBatchConsistent ? 'Tổng tồn và các lô khớp nhau.' : 'Tổng tồn và các lô có chênh lệch, cần xác minh.'}</p>
        {reconciliation.ledgerBaseline === 'UNVERIFIED' && <p className="iv-warning">Chưa xác minh được số dư đầu kỳ. Chênh lệch sổ kho cần được kiểm tra thêm, chưa thể kết luận dữ liệu bị sai.</p>}
        {!reconciliation.ledgerDifferenceIsDefinitive && reconciliation.ledgerBaseline !== 'UNVERIFIED' && <p className="iv-warning">Chênh lệch sổ kho chưa được xác nhận là sai lệch thực tế.</p>}
        <details><summary>Tham chiếu biến động ({reconciliation.movementReferences.length})</summary><div className="iv-scroll"><table><thead><tr><th>Giao dịch</th><th>Loại</th><th>Lượng</th><th>Tham chiếu</th></tr></thead><tbody>{reconciliation.movementReferences.map(m => <tr key={m.id}><td>{m.id}</td><td>{m.type}</td><td>{m.quantity}</td><td>{m.referenceType || '—'} {m.referenceId || ''}</td></tr>)}</tbody></table></div></details>
        <details><summary>Đối soát từng lô ({reconciliation.batches.length})</summary>{reconciliation.batches.map(b => <p key={b.id}>{b.id}: {b.quantityRemaining} · {b.qualityStatus}</p>)}</details>
      </> : <p>Chưa có dữ liệu đối soát đã xác nhận.</p>}</article>
    </div>
    <article className="iv-panel"><h3>Giao dịch & bút toán đảo</h3><p>Lịch sử là bất biến. Chỉ ADMIN được tạo giao dịch bù trừ riêng biệt khi máy chủ cho phép.</p>
      <div className="iv-scroll"><table><thead><tr><th>Ngày</th><th>Loại</th><th>Lô</th><th>Số lượng</th><th>Người thực hiện</th><th>Lý do / liên kết</th><th></th></tr></thead><tbody>
        {transactions.map(tx => <tr key={tx.id}><td>{new Date(tx.createdAt).toLocaleString('vi-VN')}</td><td>{tx.type}</td><td>{tx.batchCode || tx.batchId || '—'}</td><td>{tx.quantity} {ingredient.baseUnit}</td><td>{tx.performedByEmail || tx.performedBy || '—'}</td><td>{tx.reason || '—'} {tx.referenceType === 'InventoryTransactionCorrection' && <p>Bút toán đảo của #{tx.referenceId}</p>}</td><td>{isAdmin && canCorrect(tx) && <button type="button" disabled={busy || correctionLocked} onClick={() => { setCorrectionId(tx.id); setCorrectionReason(''); setConfirmed(false); }}>Tạo bút toán đảo</button>}</td></tr>)}
      </tbody></table></div>
      {isAdmin && correctionId && <form className="iv-form iv-correction" onSubmit={correct}><h4>Xác nhận đảo giao dịch #{correctionId}</h4><label>Lý do<input required maxLength={1000} disabled={busy || correctionLocked} value={correctionReason} onChange={e => setCorrectionReason(e.target.value)} /></label><label className="iv-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />Đã xác minh giao dịch gốc và tác động tồn kho</label>
        {correctionLocked && <p role="status">Kết quả chưa rõ: chỉ thử lại cùng mã, không chọn giao dịch khác.</p>}
        <div className="iv-actions"><button type="submit" disabled={busy || !confirmed}>Xác nhận bút toán đảo</button><button type="button" disabled={busy || correctionLocked} onClick={() => setCorrectionId('')}>Đóng</button></div></form>}
    </article>
  </section>;
}

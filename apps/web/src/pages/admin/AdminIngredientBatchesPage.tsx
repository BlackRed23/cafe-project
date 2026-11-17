import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ingredientBatchesApi } from '../../api/ingredient-batches.api';
import { ingredientsApi } from '../../api/ingredients.api';
import type { Ingredient } from '../../types/ingredient.types';
import type { LotList, LotTrace } from '../../types/ingredient-batch.types';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { expiryLabels, filterLots, lotDate, lotError, lotNumber, qualityLabels } from './lotFeedback';
import { LotOperations } from './LotOperations';
import './lots.css';

export function AdminIngredientBatchesPage() {
  const [params, setParams] = useSearchParams();
  const ingredientId = params.get('ingredientId') ?? '';
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [snapshot, setSnapshot] = useState<LotList | null>(null);
  const [trace, setTrace] = useState<LotTrace | null>(null);
  const [quality, setQuality] = useState('');
  const [expiry, setExpiry] = useState('');
  const [loading, setLoading] = useState(false);
  const [ingredientLoading, setIngredientLoading] = useState(true);
  const [traceLoading, setTraceLoading] = useState(false);
  const [error, setError] = useState('');
  const [traceError, setTraceError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const listEpoch = useRef(0), traceEpoch = useRef(0);
  const loadIngredients = useCallback(async () => {
    setIngredientLoading(true); setError('');
    try { setIngredients(await ingredientsApi.getIngredients({ includeInactive: true })); }
    catch (e) { setError(lotError(e)); }
    finally { setIngredientLoading(false); }
  }, []);
  useEffect(() => { queueMicrotask(() => void loadIngredients()); }, [loadIngredients]);
  const loadLots = useCallback(async () => {
    const epoch = ++listEpoch.current;
    setError(''); setSnapshot(null);
    if (!ingredientId) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await ingredientBatchesApi.listLots(ingredientId);
      if (epoch === listEpoch.current) setSnapshot(data);
    } catch (e) { if (epoch === listEpoch.current) setError(lotError(e)); }
    finally { if (epoch === listEpoch.current) setLoading(false); }
  }, [ingredientId]);
  const cancelRequests = useCallback(() => { listEpoch.current++; traceEpoch.current++; }, []);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void loadLots(); });
    return () => { active = false; cancelRequests(); };
  }, [loadLots, cancelRequests]);
  async function openTrace(batchId: string) {
    const epoch = ++traceEpoch.current;
    setSelectedId(batchId); setTrace(null); setTraceError(''); setTraceLoading(true);
    try { const data = await ingredientBatchesApi.traceLot(ingredientId, batchId); if (epoch === traceEpoch.current) setTrace(data); }
    catch (e) { if (epoch === traceEpoch.current) setTraceError(lotError(e)); }
    finally { if (epoch === traceEpoch.current) setTraceLoading(false); }
  }
  async function refreshTrace() {
    const epoch = traceEpoch.current;
    const [data, history] = await Promise.all([ingredientBatchesApi.listLots(ingredientId), ingredientBatchesApi.traceLot(ingredientId, selectedId)]);
    if (epoch === traceEpoch.current) { setSnapshot(data); setTrace(history); }
  }
  const ingredient = ingredients.find(i => i.id === ingredientId);
  const batches = snapshot ? filterLots(snapshot.batches, quality, expiry) : [];
  const currentTrace = trace?.batch.ingredientId === ingredientId ? trace : null;
  return <main className="lot-workspace">
    <header className="lot-heading"><div><span className="lot-eyebrow">Kho nguyên liệu / Theo dõi từng lô</span><h1>Quản lý lô nguyên liệu</h1><p>Tồn kho rõ ràng. Chất lượng và hạn dùng được theo dõi độc lập.</p></div><Link className="lot-link" to="/admin/ingredients">Nhập kho & quản lý nguyên liệu →</Link></header>
    <section className="lot-panel lot-toolbar"><label>Nguyên liệu<select aria-label="Chọn nguyên liệu" value={ingredientId} disabled={ingredientLoading} onChange={e => { traceEpoch.current++; setTrace(null); setSelectedId(''); setTraceError(''); setTraceLoading(false); setParams(e.target.value ? { ingredientId: e.target.value } : {}); }}><option value="">{ingredientLoading ? 'Đang tải nguyên liệu…' : 'Chọn nguyên liệu để xem lô'}</option>{ingredients.map(i => <option key={i.id} value={i.id}>{i.name} · {i.sku}{i.isActive ? '' : ' · Ngừng dùng'}</option>)}</select></label><Button variant="outline" disabled={loading || ingredientLoading} onClick={async () => { if (!ingredientId) await loadIngredients(); else { await loadLots(); if (currentTrace) await openTrace(selectedId); } }}>Tải lại dữ liệu</Button></section>
    {error && <Alert tone="danger">{error}<Button variant="outline" onClick={() => { void loadIngredients(); void loadLots(); }}>Thử lại</Button></Alert>}
    {!ingredientId && !ingredientLoading && <Alert>Chọn một nguyên liệu để xem toàn bộ lô, gồm lô cạn và lịch sử. Lô có lịch sử không thể xóa.</Alert>}
    {loading && <p role="status" className="lot-panel">Đang tải dữ liệu lô…</p>}
    {snapshot && <>
      <div className="lot-stock" aria-label="Tổng quan tồn kho">{[['Tồn vật lý', snapshot.ingredient.physicalQuantity], ['Đủ điều kiện sử dụng', snapshot.ingredient.usableQuantity], ['Đang giữ cho đơn', snapshot.ingredient.reservedQuantity], ['Khả dụng', snapshot.ingredient.availableQuantity]].map(([label, value]) => <article className="lot-panel" key={label}><span>{label}</span><strong>{lotNumber(value)} <small>{ingredient?.baseUnit}</small></strong></article>)}</div>
      <div className="lot-monitor"><p>Đánh giá lúc <strong>{lotDate(snapshot.evaluatedAt)}</strong> · Ngưỡng sắp hết hạn: <strong>{snapshot.warningDays} ngày</strong></p><p>Không có hạn dùng không đồng nghĩa đạt chất lượng. Backend quyết định khả năng phân bổ.</p></div>
      <section className="lot-panel"><div className="lot-filters"><label>Chất lượng<select value={quality} onChange={e => setQuality(e.target.value)}><option value="">Tất cả chất lượng</option>{Object.entries(qualityLabels).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label><label>Hạn dùng<select value={expiry} onChange={e => setExpiry(e.target.value)}><option value="">Tất cả hạn dùng</option>{Object.entries(expiryLabels).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label><span aria-live="polite">{batches.length} / {snapshot.batches.length} lô</span></div>
      <div className="lot-table-scroll"><table><caption className="sr-only">Các lô của {ingredient?.name ?? ingredientId}</caption><thead><tr><th scope="col">Lô / Nhận kho</th><th scope="col">Vật lý / Ban đầu</th><th scope="col">Dùng được</th><th scope="col">Hạn dùng</th><th scope="col">Chất lượng</th><th scope="col">Truy xuất</th></tr></thead><tbody>{batches.map(b => <tr key={b.id} aria-selected={selectedId === b.id}><td><strong>{b.batchCode}</strong><small>{lotDate(b.receivedAt)}</small>{b.depletionStatus === 'DEPLETED' && <span className="lot-badge">DEPLETED · Đã cạn</span>}</td><td>{lotNumber(b.physicalQuantity)} / {lotNumber(b.quantityInitial)} {ingredient?.baseUnit}</td><td>{lotNumber(b.usableQuantity)} {ingredient?.baseUnit}</td><td><span className="lot-badge" data-state={b.expiryStatus}>{expiryLabels[b.expiryStatus] ?? 'Chưa xác minh hạn dùng'}</span><small>{b.expiryStatus}</small><small>{lotDate(b.expirationDate)}</small></td><td><span className="lot-badge" data-state={b.qualityStatus}>{qualityLabels[b.qualityStatus] ?? 'Chất lượng chưa xác minh'}</span><small>{b.qualityStatus}</small></td><td><Button variant="outline" onClick={() => void openTrace(b.id)}>Xem lịch sử</Button></td></tr>)}</tbody></table></div>
      {!batches.length && <p className="lot-empty">{snapshot.batches.length ? 'Không có lô khớp bộ lọc.' : 'Nguyên liệu chưa có lô. Nhập kho tại trang nguyên liệu.'}</p>}
      <p className="lot-note">Tồn vật lý bao gồm hàng hết hạn, cách ly và thu hồi. Tồn khả dụng đã trừ lượng giữ cho đơn.</p></section>
    </>}
    {traceLoading && <p role="status" className="lot-panel">Đang tải truy xuất lô…</p>}
    {traceError && <Alert tone="danger">{traceError}<Button variant="outline" onClick={() => void openTrace(selectedId)}>Thử lại truy xuất</Button></Alert>}
    {currentTrace && <section className="lot-panel lot-trace" aria-label="Truy xuất lô"><header><span className="lot-eyebrow">Hồ sơ lô</span><h2>{currentTrace.batch.batchCode}</h2><p>ID: {currentTrace.batch.id}</p></header><LotOperations key={`${ingredientId}:${currentTrace.batch.id}`} ingredientId={ingredientId} trace={currentTrace} onRefresh={refreshTrace} />
      <h3>Sự kiện chất lượng ({currentTrace.events.length})</h3>{!currentTrace.events.length && <p>Chưa có sự kiện chất lượng được ghi nhận.</p>}{currentTrace.events.map(e => <article className="lot-record" key={e.id}><strong>{e.action} · {e.previousStatus} → {e.newStatus}</strong><p>{e.reason}</p><p>{lotDate(e.createdAt)} · Người thực hiện: {e.actorId}</p><small>Mã thao tác: {e.requestId} · Sự kiện: {e.id}</small></article>)}
      <h3>Giao dịch xuất ({currentTrace.outbound.length})</h3>{!currentTrace.outbound.length && <p>Chưa có giao dịch xuất của lô.</p>}{currentTrace.outbound.map(t => <article className="lot-record" key={t.id}><strong>{t.type} · {lotNumber(t.quantity)} {ingredient?.baseUnit}</strong><p>{lotDate(t.createdAt)} · {t.reason || 'Không ghi lý do'}</p><small>ID: {t.id} · Nguồn: {t.referenceType ?? '—'} / {t.referenceId ?? '—'} · Dòng đơn: {t.orderItemId ?? '—'}</small></article>)}
      <h3>Đơn hàng liên quan ({currentTrace.orders.length})</h3>{!currentTrace.orders.length && <p>Không có liên kết đơn hàng được ghi nhận.</p>}{currentTrace.orders.map(o => <article className="lot-record" key={o.id}><strong>Đơn {o.id}</strong><p>{o.status} · Trừ kho: {lotDate(o.stockDeductedAt)}</p><small>Dòng đơn: {currentTrace.orderItems.filter(item => item.orderId === o.id).map(item => item.id).join(', ') || 'Không có bản ghi dòng đơn'}</small></article>)}
      <h3>Hàng hoàn ({currentTrace.returns.length})</h3>{!currentTrace.returns.length && <p>Chưa ghi nhận hoàn hàng.</p>}{currentTrace.returns.map(r => <article className="lot-record" key={r.id}><strong>{lotNumber(r.quantity)} {ingredient?.baseUnit} · QUARANTINED / Cách ly</strong><p>Kiểm tra: {r.quality} · {r.reason}</p><p>{lotDate(r.createdAt)} · Người thực hiện: {r.actorId}</p><small>Giao dịch gốc: {r.sourceTransactionId} · Lô gốc: {r.sourceBatchId} · Lô hoàn: {r.targetBatchId} · Giao dịch hoàn: {r.transactionId} · Mã thao tác: {r.requestId}</small></article>)}
    </section>}
    {snapshot && !loading && <p role="status" className="lot-note">Đã tải dữ liệu lô từ máy chủ.</p>}
  </main>;
}

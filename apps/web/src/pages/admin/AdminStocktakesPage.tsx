import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ingredientsApi } from '../../api/ingredients.api';
import { usersApi } from '../../api/users.api';
import { stocktakesApi } from '../../api/stocktakes.api';
import type { Ingredient } from '../../types/ingredient.types';
import type { User } from '../../types/auth.types';
import type { StocktakeCount, StocktakeCreate, StocktakeData, CountReasonCategory } from '../../types/stocktake.types';
import { countReasons } from '../../types/stocktake.types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { labels, mayApprove, stocktakeError, errorCode, uncertainError, countIsSaved } from './stocktakeFeedback';
import './stocktakes.css';

type Intent = { kind:'CREATE'; body:StocktakeCreate } |
  { kind:'COUNT'; sessionId:string; body:StocktakeCount } |
  { kind:'SUBMIT'|'APPROVE'; sessionId:string; requestId:string } |
  { kind:'REJECT'|'REOPEN'; sessionId:string; body:{requestId:string;reason:string} };
const UUID = () => crypto.randomUUID();
const reasonLabels:Record<CountReasonCategory,string> = {
  COUNTED:'Kiểm đếm thực tế', DAMAGED:'Hư hỏng', VERIFIED_WASTE:'Hao hụt đã ghi nhận',
  WRONG_LOT:'Sai lô', EXPIRED:'Hết hạn', UNEXPLAINED:'Chưa giải thích được',
};

export function AdminStocktakesPage() {
  const { user, isAdmin }=useAuth();
  const toast=useToast();
  const [params,setParams]=useSearchParams();
  const [ingredients,setIngredients]=useState<Ingredient[]>([]);
  const [counters,setCounters]=useState<User[]>([]);
  const [scope,setScope]=useState<string[]>([]);
  const [counter,setCounter]=useState(user?.id??'');
  const [note,setNote]=useState('');
  const [lookup,setLookup]=useState(params.get('id')??'');
  const [data,setData]=useState<StocktakeData|null>(null);
  const [drafts,setDrafts]=useState<Record<string,{qty:string;reason:string;category:CountReasonCategory}>>({});
  const [decisionReason,setDecisionReason]=useState('');
  const [confirm,setConfirm]=useState(false);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [uncertain,setUncertain]=useState(false);
  const [conflict,setConflict]=useState(false);
  const [retryVerified,setRetryVerified]=useState(false);
  const [intent,setIntent]=useState<Intent|null>(null);
  const inFlight=useRef(false);

  const loadSession=useCallback(async (id:string) => {
    const result=await stocktakesApi.get(id);
    setData(result);
    setLookup(id);
    setParams({id}, {replace:true});
    return result;
  },[setParams]);
  useEffect(()=>{
    let active=true;
    ingredientsApi.getIngredients().then(v=>{if(active)setIngredients(v.filter(i=>i.isActive));})
      .catch(()=>{if(active)setError('Không tải được danh sách nguyên liệu.');});
    if(isAdmin) usersApi.getUsers().then(v=>{if(active)setCounters(v.filter(u=>
      ['ADMIN','STAFF'].includes(u.role) && u.isActive!==false && u.is_active!==false));})
      .catch(()=>{if(active)setError('Không tải được danh sách nhân viên để phân công.');});
    const id=params.get('id');
    if(id){stocktakesApi.get(id).then(v=>{if(active)setData(v);})
      .catch(e=>{if(active)setError(stocktakeError(e));})
      .finally(()=>{if(active)setLoading(false);});}
    return ()=>{active=false;};
    // Initial session URL only; explicit refresh controls subsequent loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[isAdmin]);

  async function perform(action:Intent) {
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');setIntent(action);setRetryVerified(false);
    try {
      let result:StocktakeData;
      if(action.kind==='CREATE') result=await stocktakesApi.create(action.body);
      else if(action.kind==='COUNT')result=await stocktakesApi.save(action.sessionId,action.body);
      else if(action.kind==='SUBMIT')result=await stocktakesApi.submit(action.sessionId,action.requestId);
      else if(action.kind==='APPROVE')result=await stocktakesApi.approve(action.sessionId,action.requestId);
      else if(action.kind==='REJECT')result=await stocktakesApi.reject(action.sessionId,action.body);
      else if(action.kind==='REOPEN')result=await stocktakesApi.reopen(action.sessionId,action.body);
      else throw new Error('Unsupported stocktake action');
      setData(result);
      setLookup(result.session.id);
      setParams({id:result.session.id},{replace:true});
      setIntent(null);setUncertain(false);setConflict(false);setConfirm(false);setRetryVerified(false);
      if(action.kind==='COUNT') {
        setDrafts(old=>{const next={...old};delete next[action.body.batchId];return next;});
        toast.success(action.body.actualQty===0?'Đã ghi nhận số lượng thực đếm bằng 0.':'Đã lưu số lượng kiểm đếm cho lô.');
      } else if(action.kind==='CREATE') toast.success('Đã tạo phiên kiểm kê.');
      else if(result.session.status==='NEEDS_INVESTIGATION') toast.warning('Phiên kiểm kê cần được điều tra thêm. Tồn kho chưa được điều chỉnh.');
      else if(action.kind==='SUBMIT')toast.success('Phiên kiểm kê đã được gửi phê duyệt.');
      else if(action.kind==='APPROVE' && result.session.status==='COMPLETED') toast.success('Đã phê duyệt và hoàn tất phiên kiểm kê.');
      else if(action.kind==='REJECT')toast.success('Đã từ chối phiên kiểm kê. Tồn kho không thay đổi.');
      else if(action.kind==='REOPEN')toast.success('Đã mở lại phiên để kiểm đếm; lịch sử được giữ nguyên.');
    } catch(e) {
      setError(stocktakeError(e));toast.error(stocktakeError(e));
      if(errorCode(e)===409){setConflict(true);setUncertain(false);setRetryVerified(false);}
      else if(uncertainError(e))setUncertain(true);
      else {setIntent(null);setUncertain(false);}
    } finally {inFlight.current=false;setBusy(false);}
  }
  async function refresh() {
    if(!lookup.trim()||busy)return;
    setLoading(true);
    try {
      const fresh=await loadSession(lookup.trim());setError('');
      if(uncertain && intent){
        let confirmed=false;
        if(intent.kind==='CREATE') confirmed=fresh.session.code==='STK-'+intent.body.requestId;
        else if(intent.kind==='COUNT')confirmed=fresh.entries.some(e=>e.batchId===intent.body.batchId &&
          countIsSaved(e.observedQty) && e.revision>intent.body.expectedRevision &&
          e.observedQty===String(intent.body.actualQty) && e.reason===intent.body.reason &&
          e.reasonCategory===intent.body.reasonCategory);
        else confirmed=({SUBMIT:['PENDING_APPROVAL','NEEDS_INVESTIGATION'],APPROVE:['COMPLETED','NEEDS_INVESTIGATION'],REJECT:['REJECTED'],REOPEN:['DRAFT']} as Record<string,string[]>)[intent.kind]?.includes(fresh.session.status)??false;
        if(confirmed){setIntent(null);setUncertain(false);setConfirm(false);setRetryVerified(false);toast.info('Đã tìm thấy kết quả ghi nhận trong dữ liệu máy chủ.');}
        else {
          const safe=intent.kind==='COUNT' ?
            fresh.session.status==='DRAFT' &&
            fresh.entries.find(e=>e.batchId===intent.body.batchId)?.revision===intent.body.expectedRevision &&
            fresh.current.some(c=>c.batches.some(b=>b.id===intent.body.batchId)&&c.cursor===intent.body.expectedCursor) :
            intent.kind==='SUBMIT' ? fresh.session.status==='DRAFT' :
            intent.kind==='APPROVE' ? fresh.session.status==='PENDING_APPROVAL' :
            intent.kind==='REJECT' ? ['PENDING_APPROVAL','NEEDS_INVESTIGATION'].includes(fresh.session.status) :
            intent.kind==='REOPEN' ? fresh.session.status==='NEEDS_INVESTIGATION' : false;
          setRetryVerified(safe);
          setError(safe ? 'Chưa có bằng chứng yêu cầu được áp dụng; có thể xác nhận thử lại cùng mã sau khi đối chiếu.' :
            'Không thể xác minh phiên bản cũ còn hợp lệ. Không thử lại; lưu số đo riêng và kiểm kê lại theo phiên bản mới.');
        }
      } else if(!uncertain){setConflict(false);setIntent(null);setConfirm(false);setRetryVerified(false);}
    } catch(e){setError(stocktakeError(e));} finally{setLoading(false);}
  }
  const canCount=!!data && data.session.status==='DRAFT' && data.session.assignedCounterId===user?.id;
  const canSubmit=canCount && data!.uncounted===0 && data!.untrackedBatches.length===0;
  const canApprove=!!data && mayApprove(data,user?.id??'',isAdmin);
  const canDecide=!!data && isAdmin && ['PENDING_APPROVAL','NEEDS_INVESTIGATION'].includes(data.session.status);
  const canReopen=!!data && isAdmin && data.session.status==='NEEDS_INVESTIGATION';
  function saveCount(batchId:string,ingredientId:string,revision:number) {
    if(!data||!canCount||intent)return;
    const draft=drafts[batchId];
    const qty=Number(draft?.qty);
    const cursor=data.current.find(c=>c.ingredientId===ingredientId)?.cursor;
    if(!draft || draft.qty.trim()==='' || !Number.isFinite(qty) || qty<0 || Math.abs(qty*1000-Math.round(qty*1000))>0.00001 || !draft.reason.trim() || !cursor){
      setError('Nhập số lượng kiểm đếm không âm, tối đa 3 chữ số thập phân, và lý do.');return;
    }
    void perform({kind:'COUNT',sessionId:data.session.id,body:{requestId:UUID(),batchId,expectedCursor:cursor,expectedRevision:revision,
      actualQty:qty,reason:draft.reason.trim(),reasonCategory:draft.category}});
  }
  const begin=(action:Intent)=>{if(!confirm){setError('Hãy xác nhận thao tác trước khi gửi máy chủ.');return;}void perform(action);};

  return <div className="stocktake-workspace">
    <header className="stk-heading"><div><span className="stk-eyebrow">VẬN HÀNH / KIỂM KÊ PHIÊN</span><h1>Kiểm kê nguyên liệu</h1><p>Theo dõi từng lô, đối chiếu biến động và phê duyệt có kiểm soát.</p></div><Link to="/admin/ingredients">Kho nguyên liệu</Link></header>
    {error && <p className="stk-alert" role="alert">{error}</p>}
    {uncertain && <p className="stk-alert" role="status">Chưa xác định kết quả. Tải phiên để đối soát; nếu phải thử lại, giữ nguyên requestId và payload. Không tự động ghi lặp.</p>}
    {conflict && <p className="stk-alert" role="status">Phiên bản hoặc cursor đã thay đổi. Dữ liệu nhập vẫn được giữ. Tải phiên mới và xác nhận lại trước khi đếm lại.</p>}
    <div className="stk-grid">
      <section className="stk-panel"><h2>Mở phiên kiểm kê</h2><p>Chọn 1–50 nguyên liệu không trùng nhau. Phiên mới không thay đổi tồn kho.</p>
        <form onSubmit={e=>{e.preventDefault();if(!user?.id||!scope.length||scope.length>50||!counter)return;begin({kind:'CREATE',body:{requestId:UUID(),ingredientIds:[...scope].sort(),assignedCounterId:counter,...(note.trim()?{note:note.trim()}:{})}});}} className="stk-form">
          <label>Người kiểm đếm{isAdmin?<select value={counter} onChange={e=>setCounter(e.target.value)} required disabled={busy||!!intent}><option value="">Chọn tài khoản</option>{counters.map(u=><option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}</select>:<input value={user?.name??''} readOnly />}</label>
          <fieldset disabled={busy||!!intent}><legend>Phạm vi nguyên liệu ({scope.length}/50)</legend><div className="stk-picker">{ingredients.map(i=><label key={i.id}><input type="checkbox" checked={scope.includes(i.id)} disabled={!scope.includes(i.id)&&scope.length>=50} onChange={e=>setScope(old=>e.target.checked?[...old,i.id]:old.filter(v=>v!==i.id))}/>{i.name} · {i.sku}</label>)}</div></fieldset>
          <label>Ghi chú<input maxLength={1000} value={note} disabled={busy||!!intent} onChange={e=>setNote(e.target.value)}/></label>
          <button type="submit" disabled={busy||!!intent||!scope.length||!counter||!confirm}>Tạo phiên mới</button>
        </form>
      </section>
      <section className="stk-panel"><h2>Truy cập phiên đã lưu</h2><p>Không có API danh sách phiên; mở bằng mã phiên đã biết.</p>
        <div className="stk-form"><label>ID phiên<input value={lookup} onChange={e=>setLookup(e.target.value)}/></label><button disabled={!lookup.trim()||busy||loading} onClick={()=>void refresh()}>{loading?'Đang tải…':'Tải phiên / đối soát'}</button></div>
        {data && <><div className="stk-metrics"><div><small>Trạng thái</small><strong>{labels[data.session.status]}</strong></div><div><small>Đã đếm</small><strong>{data.counted}</strong></div><div><small>Chưa đếm</small><strong>{data.uncounted}</strong></div><div><small>Lô mới</small><strong>{data.untrackedBatches.length}</strong></div></div>
          <p>Mã: {data.session.id}</p><p>Người đếm: {counters.find(u=>u.id===data.session.assignedCounterId)?.name||data.session.assignedCounterId}</p><p>Nguyên liệu: {data.session.scope.map(id=>ingredients.find(i=>i.id===id)?.name||id).join(', ')}</p><p>Cập nhật: {new Date(data.session.updatedAt).toLocaleString('vi-VN')} · Revision {data.session.revision}</p>
          {data.session.investigationReason && <p className="stk-alert">Lý do cần điều tra: {data.session.investigationReason}</p>}
          {data.session.rejectedReason && <p>Đã từ chối: {data.session.rejectedReason}</p>}
        </>}
      </section>
    </div>
    <label className="stk-confirm"><input type="checkbox" checked={confirm} disabled={busy} onChange={e=>setConfirm(e.target.checked)}/> Tôi đã đối chiếu và xác nhận hành động quan trọng.</label>
    {data && <section className="stk-panel"><div className="stk-row"><h2>Phiếu đếm từng lô</h2><span>{labels[data.session.status]} · Revision {data.session.revision}</span></div>
      {data.untrackedBatches.length>0 && <p className="stk-alert">Có {data.untrackedBatches.length} lô nhập sau khi mở phiên; cần bổ sung số đếm từng lô trước khi nộp.</p>}
      {data.session.scope.map(ingredientId=><div key={ingredientId} className="stk-group"><h3>{ingredients.find(i=>i.id===ingredientId)?.name||ingredientId}</h3>
        <div className="stk-scroll"><table><thead><tr><th>Lô / chất lượng</th><th>Tồn mở phiên</th><th>Tồn máy chủ</th><th>Đã đếm</th><th>Chênh lệch</th><th>Revision</th><th>Thao tác</th></tr></thead><tbody>
          {[...data.entries.filter(e=>e.ingredientId===ingredientId),...data.untrackedBatches.filter(e=>e.ingredientId===ingredientId).map(e=>({
            id:e.batchId,ingredientId:e.ingredientId,batchId:e.batchId,openingQty:'0',openingCursor:'0',openingQualityStatus:'—',openingExpirationDate:null,presentAtOpen:false,
            expectedAtCount:null,observedQty:null,varianceQty:null,observedCursor:null,countedAt:null,countedById:null,reason:null,reasonCategory:null,revision:0,history:[],
          } as const))].map(entry=>{
            const batch=data.current.find(c=>c.ingredientId===ingredientId)?.batches.find(b=>b.id===entry.batchId);
            const draft=drafts[entry.batchId]??{qty:entry.observedQty??'',reason:entry.reason??'',category:entry.reasonCategory??'COUNTED' as CountReasonCategory};
            return <tr key={entry.batchId}><td><strong>{batch?.batchCode||entry.batchId}</strong><small>{batch?.qualityStatus||entry.openingQualityStatus} · {batch?.expirationDate?'HSD '+new Date(batch.expirationDate).toLocaleDateString('vi-VN'):'Không có HSD'} · {batch?.usable?'Khả dụng':'Không khả dụng'}</small></td>
              <td>{entry.openingQty}</td><td>{batch?.quantityRemaining??'—'}</td><td>{entry.observedQty===null?'Chưa đếm':entry.observedQty}</td><td>{entry.varianceQty??'—'}</td><td>{entry.revision}</td><td>{canCount && <div className="stk-cell">
                <input aria-label="Số lượng thực đếm" type="number" min="0" step=".001" value={draft.qty} disabled={busy||!!intent} onChange={e=>setDrafts(old=>({...old,[entry.batchId]:{...draft,qty:e.target.value}}))}/>
                <select aria-label="Nguyên nhân" value={draft.category} disabled={busy||!!intent} onChange={e=>setDrafts(old=>({...old,[entry.batchId]:{...draft,category:e.target.value as CountReasonCategory}}))}>{countReasons.map(r=><option key={r} value={r}>{reasonLabels[r]}</option>)}</select>
                <input aria-label="Lý do kiểm đếm" placeholder="Bằng chứng / lý do" value={draft.reason} disabled={busy||!!intent} onChange={e=>setDrafts(old=>({...old,[entry.batchId]:{...draft,reason:e.target.value}}))}/>
                <button disabled={busy||!!intent} onClick={()=>saveCount(entry.batchId,ingredientId,entry.revision)}>Lưu số đếm</button>
              </div>}</td></tr>;
          })}</tbody></table></div>
          {data.entries.filter(e=>e.ingredientId===ingredientId&&e.history.length>0).map(e=><details key={e.id}><summary>Lịch sử lô #{e.batchId} — {e.history.length} lần ghi</summary>{e.history.map(h=><p key={h.id}>Revision {h.revision}: {h.previousQty??'Chưa đếm'} → {h.newQty} · {h.reason} · {h.actorId} · {new Date(h.createdAt).toLocaleString('vi-VN')}</p>)}</details>)}
        </div>)}
      <div className="stk-actions">
        {canCount && <button disabled={busy||!!intent||!canSubmit||!confirm} onClick={()=>begin({kind:'SUBMIT',sessionId:data.session.id,requestId:UUID()})}>Gửi phê duyệt</button>}
        {canCount && !canSubmit && <p>Vẫn còn lô chưa kiểm đếm. Vui lòng hoàn tất trước khi gửi duyệt.</p>}
        {canApprove && <button disabled={busy||!!intent||!confirm} onClick={()=>begin({kind:'APPROVE',sessionId:data.session.id,requestId:UUID()})}>ADMIN phê duyệt</button>}
        {isAdmin && data.session.assignedCounterId===user?.id && data.session.status==='PENDING_APPROVAL' && <p>Bạn không thể tự phê duyệt phiên kiểm kê do mình phụ trách.</p>}
        {canDecide && <label>Lý do từ chối hoặc mở lại<input maxLength={1000} value={decisionReason} disabled={busy||!!intent} onChange={e=>setDecisionReason(e.target.value)}/></label>}
        {canDecide && <button disabled={busy||!!intent||!confirm||!decisionReason.trim()} onClick={()=>begin({kind:'REJECT',sessionId:data.session.id,body:{requestId:UUID(),reason:decisionReason.trim()}})}>Từ chối</button>}
        {canReopen && <button disabled={busy||!!intent||!confirm||!decisionReason.trim()} onClick={()=>begin({kind:'REOPEN',sessionId:data.session.id,body:{requestId:UUID(),reason:decisionReason.trim()}})}>Yêu cầu đếm lại</button>}
      </div>
    </section>}
    {intent && <section className="stk-panel"><h2>Yêu cầu đang đối soát</h2><p>Loại: {intent.kind} · Không tạo mã mới khi chưa biết kết quả.</p>
      <button disabled={busy} onClick={()=>void refresh()}>Đọc trạng thái từ máy chủ</button>
      {uncertain && !conflict && <button disabled={busy||!confirm||(!retryVerified&&intent.kind!=='CREATE')} onClick={()=>void perform(intent)}>Xác nhận thử lại cùng yêu cầu cũ</button>}
      {conflict && <p>Không gửi lại khi đang xung đột. Sau khi tải lại, nhập số đếm mới và xác nhận bằng yêu cầu mới.</p>}
    </section>}
  </div>;
}

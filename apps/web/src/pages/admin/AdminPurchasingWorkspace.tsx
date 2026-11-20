import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { purchasingApi } from '../../api/purchasing.api';
import { ingredientsApi } from '../../api/ingredients.api';
import type { Ingredient } from '../../types/ingredient.types';
import type { PurchasingOrder, PurchasingReceipt, PurchasingDiscrepancy, PurchasingInvoice } from '../../types/purchasing.types';
import './purchasing-workspace.css';

type BatchDraft={batchCode:string;expirationDate:string;quantity:string};
type ReceiptDraft={id:string;qty:string;batches:BatchDraft[]};
type Pending={label:string;body:unknown;orderId?:string;run:()=>Promise<unknown>};
const uuid=()=>crypto.randomUUID();
const positiveInt=(s:string)=>/^\d+$/.test(s)&&Number.isSafeInteger(Number(s))&&Number(s)>0;
const outcome=(e:unknown)=> (e as {response?:{status?:number;data?:{message?:string}}})?.response;
function explanation(e:unknown):string{
  const code=outcome(e)?.status;
  if(code===400)return 'Dữ liệu không hợp lệ. Kiểm tra số lượng, đơn vị, hạn dùng và lý do.';
  if(code===401)return 'Phiên đăng nhập đã hết hạn.';
  if(code===403)return 'Bạn không có quyền thực hiện nghiệp vụ này.';
  if(code===404)return 'Không tìm thấy chứng từ hoặc mặt hàng.';
  if(code===409)return 'Dữ liệu hoặc trạng thái đơn mua đã thay đổi. Hãy tải lại và đối chiếu trước khi gửi yêu cầu mới.';
  return 'Chưa xác định được kết quả xử lý. Không gửi lại bằng mã yêu cầu mới.';
}
const status=(text:string)=>text.replaceAll('_',' ');
export function AdminPurchasingWorkspace(){
  const {isAdmin,isStaff}=useAuth();
  const toast=useToast();
  const [params,setParams]=useSearchParams();
  const [orderId,setOrderId]=useState(params.get('po')??'');
  const [order,setOrder]=useState<PurchasingOrder|null>(null);
  const [prId,setPrId]=useState('');
  const [ingredientId,setIngredientId]=useState('');
  const [ingredients,setIngredients]=useState<Ingredient[]>([]);
  const [eligible,setEligible]=useState<Awaited<ReturnType<typeof purchasingApi.eligibleSuppliers>>|null>(null);
  const [supplierId,setSupplierId]=useState('');
  const [quantity,setQuantity]=useState('1');
  const [reason,setReason]=useState('');
  const [evidence,setEvidence]=useState('');
  const [mode,setMode]=useState<'SANDBOX'|'UNKNOWN'>('SANDBOX');
  const [action,setAction]=useState<'assign-supplier'|'select-supplier'>('assign-supplier');
  const [tab,setTab]=useState<'po'|'receipt'|'discrepancy'|'return'|'invoice'>('po');
  const [receiptDraft,setReceiptDraft]=useState<Record<string,ReceiptDraft>>({});
  const [invoiceNo,setInvoiceNo]=useState('');
  const [receiptNote,setReceiptNote]=useState('');
  const [discrepancyItem,setDiscrepancyItem]=useState('');
  const [category,setCategory]=useState<PurchasingDiscrepancy['category']>('DAMAGED');
  const [observed,setObserved]=useState('1');
  const [accepted,setAccepted]=useState('0');
  const [observedIngredient,setObservedIngredient]=useState('');
  const [returnReceipt,setReturnReceipt]=useState('');
  const [returnBatch,setReturnBatch]=useState('');
  const [returnQty,setReturnQty]=useState('1');
  const [invoiceDraft,setInvoiceDraft]=useState<Record<string,{quantity:string;unitPrice:string;total:string}>>({});
  const [pending,setPending]=useState<Pending|null>(null);
  const [uncertain,setUncertain]=useState(false);
  const [reconciled,setReconciled]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [result,setResult]=useState('');
  const guard=useRef(false);
  useEffect(()=>{
    let alive=true;
    ingredientsApi.getIngredients().then(v=>{if(alive)setIngredients(v.filter(i=>i.isActive));}).catch(()=>{});
    return()=>{alive=false;};
  },[]);
  const loadOrder=async(id=orderId)=>{
    if(!isAdmin||!id.trim())return;
    setBusy(true);
    try{
      const data=await purchasingApi.getOrder(id.trim());setOrder(data);setOrderId(data.id);
      setParams({po:data.id},{replace:true});setError('');
      if(pending&&uncertain){
        const requestId=(pending.body as {requestId?:string}).requestId;
        const proven=!!requestId && (
          data.events.some(x=>(x as typeof x&{requestId?:string}).requestId===requestId) ||
          data.discrepancies.some(x=>(x as typeof x&{requestId?:string}).requestId===requestId) ||
          data.supplierReturns.some(x=>(x as typeof x&{requestId?:string}).requestId===requestId) ||
          data.invoices.some(x=>(x as typeof x&{requestId?:string}).requestId===requestId) ||
          data.receipts.some(x=>(x as typeof x&{idempotencyKey?:string}).idempotencyKey===requestId)
        );
        if(proven){setPending(null);setUncertain(false);setResult('Đã tìm thấy chứng cứ yêu cầu trước trong chứng từ máy chủ.');}
        else {setReconciled(true);setError('Chưa tìm được bằng chứng của mã yêu cầu trong chứng từ. Không được tạo mã mới; chỉ thử lại đúng payload cũ sau khi kiểm tra.');}
      }else{setReceiptDraft({});setInvoiceDraft({});setPending(null);setUncertain(false);}
      setConfirmed(false);
    }catch(e){setError(explanation(e));}finally{setBusy(false);}
  };
  async function execute(p:Pending){
    if(guard.current)return;
    guard.current=true;setBusy(true);setPending(p);setReconciled(false);setError('');setResult('');
    try{
      const response=await p.run() as Record<string,unknown>;
      const nextOrder=(response.order??((response.items&&response.events)?response:null)) as PurchasingOrder|null;
      if(nextOrder?.id){setOrder(nextOrder);setOrderId(nextOrder.id);setParams({po:nextOrder.id},{replace:true});}
      else if(p.orderId && isAdmin){try{setOrder(await purchasingApi.getOrder(p.orderId));}catch{/* Keep confirmed outcome */}}
      const extra=response.reconciliation as {status?:string}|undefined;
      if(extra?.status==='DISPUTED')setResult('Đã đối soát hóa đơn. Có chênh lệch cần xử lý. Không phê duyệt thanh toán.');
      else if(response.discrepancy)setResult('Đã ghi nhận sai lệch giao hàng (HELD). Hàng chưa được tự động nhập kho.');
      else if(response.supplierReturn)setResult('Đã ghi nhận trả hàng. Công nợ nhà cung cấp: UNSETTLED, chưa có xác nhận hoàn tiền.');
      else if(response.externalDelivery)setResult('Đã ghi nhận thao tác gửi thử nghiệm; chưa xác minh nhà cung cấp đã nhận đơn.');
      else if(response.externalConfirmation)setResult('Đã ghi nhận xác nhận do ADMIN cung cấp; chưa xác minh độc lập từ nhà cung cấp.');
      else if(response.remainingCancellation)setResult('Yêu cầu hủy được lưu nhưng đang BLOCKED_POLICY, chưa kết thúc nghĩa vụ mua hàng.');
      else if(p.label==='Nhập hàng')setResult(nextOrder?.status==='PARTIALLY_RECEIVED'?'Đã nhận một phần hàng. Đơn vẫn còn số lượng chưa nhận.':'Đã ghi nhận phiếu nhập hàng.');
      else if(p.label==='Tạo PO')setResult('Đã tạo đơn đặt hàng từ yêu cầu được duyệt.');
      else if(p.label==='Đối soát hóa đơn')setResult('Đã đối soát hóa đơn. Chưa cấp quyền thanh toán.');
      else setResult(`Đã ghi nhận: ${p.label}.`);
      toast.success('Máy chủ đã xác nhận thao tác mua hàng.');
      setPending(null);setUncertain(false);setReconciled(false);setConfirmed(false);
    }catch(e){
      const message=explanation(e);setError(message);toast.error(message);
      const code=outcome(e)?.status;
      setUncertain(!code || code>=500 || code===408);
      if(code && code<500 && code!==408)setPending(null);
    }finally{guard.current=false;setBusy(false);}
  }
  const run=(p:Pending)=>{
    if(!confirmed){setError('Bạn phải đánh dấu xác nhận trước khi thực hiện.');return;}
    if(pending){setError('Còn yêu cầu chưa được xác minh kết quả. Tải lại chứng từ trước khi tạo thao tác mới.');return;}
    void execute(p);
  };
  const poAction=(label:string,fn:(id:string,requestId:string)=>Promise<unknown>)=>{
    if(!order)return;
    const id=order.id,requestId=uuid();
    run({label,orderId:id,body:{requestId,reason,evidence},run:()=>fn(id,requestId)});
  };
  const remaining=(item:PurchasingOrder['items'][number])=>item.quantityOrdered-item.quantityReceived;
  const addLine=(id:string)=>setReceiptDraft(old=>({...old,[id]:{
    id,qty:old[id]?.qty??'',batches:[...(old[id]?.batches??[]),{batchCode:'',expirationDate:'',quantity:''}],
  }}));
  const updateLine=(id:string,index:number,patch:Partial<BatchDraft>)=>setReceiptDraft(old=>{
    const oldLine=old[id];if(!oldLine)return old;
    return {...old,[id]:{...oldLine,batches:oldLine.batches.map((v,i)=>i===index?{...v,...patch}:v)}};
  });
  function submitReceipt(){
    if(!order)return;
    const items:PurchasingReceipt['items']=[];
    for(const [id,line] of Object.entries(receiptDraft)){
      if(!line.qty.trim()&&!line.batches.some(b=>b.quantity.trim()))continue;
      const item=order.items.find(i=>i.id===id);
      if(!item||!positiveInt(line.qty)||Number(line.qty)>remaining(item)||
        !line.batches.length||line.batches.some(b=>!b.batchCode.trim()||!b.expirationDate||!positiveInt(b.quantity))||
        line.batches.reduce((s,b)=>s+Number(b.quantity),0)!==Number(line.qty)){
        setError('Tổng lô phải bằng lượng nhận, là số nguyên dương và không vượt PO còn lại. Mã lô/hạn dùng bắt buộc.');return;
      }
      items.push({purchaseOrderItemId:id,receivedQuantity:Number(line.qty),
        batches:line.batches.map(b=>({batchCode:b.batchCode.trim(),expirationDate:new Date(`${b.expirationDate}T00:00:00+07:00`).toISOString(),
          quantity:Number(b.quantity)}))});
    }
    if(!items.length){setError('Chọn ít nhất một mặt hàng và lô thực nhận.');return;}
    const id=order.id,body:PurchasingReceipt={requestId:uuid(),items,
      ...(invoiceNo.trim()?{supplierInvoiceNo:invoiceNo.trim()}:{}),...(receiptNote.trim()?{note:receiptNote.trim()}: {})};
    run({label:'Nhập hàng',orderId:id,body,run:()=>purchasingApi.receipt(id,body)});
  }
  function submitInvoice(){
    if(!order||!invoiceNo.trim())return setError('Nhập mã hóa đơn.');
    const items:PurchasingInvoice['items']=[];
    for(const item of order.items){
      const d=invoiceDraft[item.id]??{quantity:String(item.quantityReceived),unitPrice:String(item.unitPrice),total:String(item.quantityReceived*Number(item.unitPrice))};
      if(!positiveInt(d.quantity)||![d.unitPrice,d.total].every(v=>v.trim()!==''&&Number.isFinite(Number(v))&&Number(v)>=0)){
        setError('Số lượng hóa đơn phải nguyên dương; đơn giá và thành tiền không âm.');return;
      }
      items.push({purchaseOrderItemId:item.id,ingredientId:item.ingredientId,quantity:Number(d.quantity),
        unit:item.unit,unitPrice:Number(d.unitPrice),total:Number(d.total)});
    }
    const id=order.id,body:PurchasingInvoice={requestId:uuid(),invoiceNumber:invoiceNo.trim(),currency:order.currency,items};
    run({label:'Đối soát hóa đơn',orderId:id,body,run:()=>purchasingApi.invoice(id,body)});
  }
  return <div className="purchasing-workspace">
    <header className="pur-header"><div><small>OPERATIONS / PROCUREMENT</small><h1>Mua hàng & đối soát</h1><p>Phiếu yêu cầu → Đơn mua → Nhận theo lô → Đối soát chứng từ.</p></div><Link to="/admin/purchase-requests">Danh sách yêu cầu mua hàng</Link></header>
    {error&&<p role="alert" className="pur-warning">{error}</p>}{result&&<p role="status" className="pur-success">{result}</p>}
    {pending&&<section className="pur-warning"><strong>{uncertain?'Kết quả chưa rõ':'Yêu cầu đang xử lý'}</strong><p>{pending.label}: giữ nguyên requestId và payload. Không tự động thử lại.</p><p>Tải lại PO để kiểm tra trạng thái và sự kiện trước khi quyết định. Không dùng mã mới cho cùng hành động.</p>
      {isAdmin&&pending.orderId&&<button disabled={busy} onClick={()=>void loadOrder(pending.orderId)}>Tải chứng từ để đối chiếu (không gửi lại)</button>}
      {uncertain&&reconciled&&<button disabled={busy||!confirmed} onClick={()=>void execute(pending)}>Xác nhận thử lại cùng requestId / payload</button>}
      {uncertain&&!pending.orderId&&<button disabled={busy||!confirmed} onClick={()=>{
        if(window.confirm('Không có API truy vấn danh sách PO để chứng minh yêu cầu cũ. Chỉ thử lại chính xác cùng requestId và nội dung ban đầu?'))void execute(pending);
      }}>Thử lại an toàn cùng mã yêu cầu cũ</button>}
      {!uncertain&&<button disabled={busy} onClick={()=>setPending(null)}>Đóng cảnh báo</button>}
    </section>}
    <label className="pur-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={busy}/> Tôi xác nhận đã kiểm tra thông tin và quyền thao tác.</label>
    <div className="pur-grid">
      <section className="pur-panel"><h2>01 · Nguồn nhu cầu & nhà cung cấp</h2><p>Yêu cầu mua hàng hiện có được quản lý tại <Link to="/admin/purchase-requests">trang PR</Link>. Không tự duyệt hoặc tạo PO.</p>
        <label>Nguyên liệu<select value={ingredientId} onChange={e=>{setIngredientId(e.target.value);setEligible(null);}}><option value="">Chọn nguyên liệu</option>{ingredients.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
        {isAdmin&&<button disabled={!ingredientId||busy} onClick={()=>{setError('');void purchasingApi.eligibleSuppliers(ingredientId).then(setEligible).catch(e=>setError(explanation(e)));}}>Tra cứu nhà cung cấp hợp lệ</button>}
        {eligible&&<p>{eligible.status}: {eligible.eligible.map(e=>`${e.supplierName} (${e.purchaseUnit}, 1 = ${e.conversionToBase})`).join('; ')||'Chưa có nhà cung cấp hợp lệ'}</p>}
        <label>Số lượng nhu cầu<input type="number" min="1" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
        <label>PR ID (để gán/đổi nhà cung cấp, lập PO)<input value={prId} onChange={e=>setPrId(e.target.value)}/></label>
        {isAdmin&&<><label>Nhà cung cấp được chọn (ID theo danh sách hợp lệ)<select value={supplierId} onChange={e=>setSupplierId(e.target.value)}><option value="">Chọn nhà cung cấp</option>{eligible?.eligible.map(v=><option value={v.supplierId} key={v.supplierId}>{v.supplierName}</option>)}</select></label>
          <label>Thao tác nhà cung cấp<select value={action} onChange={e=>setAction(e.target.value as typeof action)}><option value="assign-supplier">Gán cho PR chờ nguồn</option><option value="select-supplier">Chọn lại sau PO bị hủy/từ chối</option></select></label>
          <button disabled={!prId||!supplierId||!reason.trim()||busy||!!pending} onClick={()=>{
            const id=prId,body={requestId:uuid(),supplierId,reason:reason.trim()};run({label:'Gán/chọn nhà cung cấp',body,run:()=>purchasingApi.supplierAction(id,action,body)});
          }}>Ghi nhận lựa chọn nhà cung cấp</button>
          <button disabled={!prId||busy||!!pending} onClick={()=>{
            const body={requestId:uuid(),purchaseRequestId:prId,currency:'VND' as const};
            run({label:'Tạo PO',body,run:()=>purchasingApi.createOrder(body)});
          }}>Tạo PO từ PR đã duyệt</button></>}
        {(isStaff||isAdmin)&&<button disabled={!ingredientId||!positiveInt(quantity)||!reason.trim()||busy||!!pending} onClick={()=>{
          const body={requestId:uuid(),ingredientId,quantity:Number(quantity),reason:reason.trim()};
          run({label:'Giữ nhu cầu chờ nhà cung cấp',body,run:()=>purchasingApi.sourcingHold(body)});
        }}>Tạo sourcing hold (chỉ khi không có NCC hợp lệ)</button>}
      </section>
      <section className="pur-panel"><h2>02 · Tra cứu đơn mua</h2><p>Không giả lập danh sách PO. Chỉ mở bằng ID chứng từ đã biết.</p>
        <label>Mã PO ID<input value={orderId} onChange={e=>setOrderId(e.target.value)} placeholder="PO ID"/></label>
        {isAdmin?<button disabled={!orderId.trim()||busy} onClick={()=>void loadOrder()}>Tải chi tiết PO</button>:<p className="pur-warning">GET /purchase-orders/:id hiện chỉ dành cho ADMIN. STAFF không được phép xem chi tiết PO qua endpoint này; cần có quyền truy cập PO hợp lệ để điền phiếu nhận.</p>}
        {order&&<div className="pur-summary"><strong>{order.code}</strong><span>{status(order.status)}</span><p>{order.supplierName} · {order.currency} · {order.recipientEmail||'Không có email'}</p><p>PR: {order.purchaseRequestId}</p>
          <div className="pur-scroll"><table><thead><tr><th>Nguyên liệu</th><th>Đặt</th><th>Đã nhận</th><th>Còn lại</th><th>Đơn vị</th><th>Đơn giá</th></tr></thead><tbody>
            {order.items.map(i=><tr key={i.id}><td>{ingredients.find(v=>v.id===i.ingredientId)?.name||i.ingredientId}</td><td>{i.quantityOrdered}</td><td>{i.quantityReceived}</td><td>{remaining(i)}</td><td>{i.unit} (1 = {i.conversionToBase})</td><td>{i.unitPrice}</td></tr>)}
          </tbody></table></div>
        </div>}
      </section>
    </div>
    {order&&<section className="pur-panel">
      <nav className="pur-tabs" aria-label="Nghiệp vụ đơn mua">{(['po','receipt','discrepancy','return','invoice'] as const).filter(t=>isAdmin||t==='receipt'||t==='discrepancy').map(t=>
        <button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{({po:'Điều phối',receipt:'Nhận hàng',discrepancy:'Sai lệch',return:'Trả NCC',invoice:'Hóa đơn'})[t]}</button>)}</nav>
      {tab==='po'&&isAdmin&&<div className="pur-form"><h2>03 · Điều phối & bằng chứng</h2>
        <p className="pur-warning">SANDBOX không gửi email; UNKNOWN không xác nhận đã gửi. Xác nhận thủ công chưa phải xác minh độc lập.</p>
        <label>Chế độ điều phối<select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="SANDBOX">SANDBOX (chỉ ghi thử)</option><option value="UNKNOWN">UNKNOWN (kết quả chưa rõ)</option></select></label>
        <label>Lý do / ghi chú<input value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)}/></label>
        <label>Tham chiếu bằng chứng<input value={evidence} maxLength={1000} onChange={e=>setEvidence(e.target.value)}/></label>
        <div className="pur-actions">
          {['CREATED','SANDBOX_SENT','DISPATCH_UNKNOWN'].includes(order.status)&&<button disabled={!reason.trim()||busy||!!pending} onClick={()=>poAction('Ghi điều phối', (id,requestId)=>purchasingApi.dispatch(id,{requestId,mode,reason:reason.trim()}))}>Ghi điều phối thử</button>}
          {['CREATED','SANDBOX_SENT','DISPATCH_UNKNOWN'].includes(order.status)&&<button disabled={!reason.trim()||!evidence.trim()||busy||!!pending} onClick={()=>poAction('Xác nhận thủ công',(id,requestId)=>purchasingApi.decision(id,'confirm',{requestId,reason:reason.trim(),evidenceReference:evidence.trim()}))}>Ghi xác nhận thủ công</button>}
          {['CREATED','SANDBOX_SENT','DISPATCH_UNKNOWN','CONFIRMED'].includes(order.status)&&order.items.every(i=>i.quantityReceived===0)&&<button disabled={!reason.trim()||!evidence.trim()||busy||!!pending} onClick={()=>poAction('Từ chối PO',(id,requestId)=>purchasingApi.decision(id,'reject',{requestId,reason:reason.trim(),evidenceReference:evidence.trim()}))}>Từ chối theo bằng chứng</button>}
          {order.status==='CREATED'&&<button disabled={!reason.trim()||busy||!!pending} onClick={()=>poAction('Hủy PO mới',(id,requestId)=>purchasingApi.cancellation(id,'cancel',{requestId,reason:reason.trim()}))}>Hủy PO chưa điều phối</button>}
          {['SANDBOX_SENT','DISPATCH_UNKNOWN','CONFIRMED','PARTIALLY_RECEIVED'].includes(order.status)&&<button disabled={!reason.trim()||busy||!!pending} onClick={()=>poAction('Đề nghị hủy — chờ chính sách',(id,requestId)=>purchasingApi.cancellation(id,'request-cancel',{requestId,reason:reason.trim(),...(evidence.trim()?{supplierEvidenceReference:evidence.trim()}: {})}))}>Đề nghị hủy (BLOCKED_POLICY)</button>}
        </div>
      </div>}
      {tab==='receipt'&&<div className="pur-form"><h2>04 · Nhận hàng theo lô</h2><p>Chỉ tiếp nhận hàng hợp lệ cho PO đã xác nhận, còn số lượng chưa nhận. Nhập từng đợt, không nhập lại bằng ID mới khi kết quả chưa rõ.</p>
        {order.items.filter(i=>remaining(i)>0).map(i=><fieldset key={i.id}><legend>{ingredients.find(x=>x.id===i.ingredientId)?.name||i.ingredientId} · Còn {remaining(i)} {i.unit}</legend>
          <label>Lượng thực nhận<input type="number" step="1" min="1" max={remaining(i)} value={receiptDraft[i.id]?.qty??''} onChange={e=>setReceiptDraft(old=>({...old,[i.id]:{id:i.id,qty:e.target.value,batches:old[i.id]?.batches??[]}}))}/></label>
          {(receiptDraft[i.id]?.batches??[]).map((b,j)=><div className="pur-batch" key={j}><label>Mã lô<input value={b.batchCode} onChange={e=>updateLine(i.id,j,{batchCode:e.target.value})}/></label><label>Hạn sử dụng<input type="date" value={b.expirationDate} onChange={e=>updateLine(i.id,j,{expirationDate:e.target.value})}/></label><label>SL lô<input type="number" min="1" step="1" value={b.quantity} onChange={e=>updateLine(i.id,j,{quantity:e.target.value})}/></label><button type="button" onClick={()=>setReceiptDraft(old=>({...old,[i.id]:{...old[i.id],batches:old[i.id].batches.filter((_,index)=>index!==j)}}))}>Bỏ lô</button></div>)}
          <button type="button" onClick={()=>addLine(i.id)}>+ Thêm lô</button>
        </fieldset>)}
        <label>Số hóa đơn NCC (nếu có)<input value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)}/></label><label>Ghi chú<input value={receiptNote} onChange={e=>setReceiptNote(e.target.value)}/></label>
        <button disabled={busy||!!pending||!['CONFIRMED','PARTIALLY_RECEIVED'].includes(order.status)} onClick={submitReceipt}>Ghi nhận phiếu nhập theo PO</button>
      </div>}
      {tab==='discrepancy'&&<div className="pur-form"><h2>05 · Sai lệch giao hàng</h2><p>Ghi nhận HELD; không tự động cộng hàng từ chối vào tồn khả dụng.</p>
        <label>Mặt hàng PO<select value={discrepancyItem} onChange={e=>setDiscrepancyItem(e.target.value)}><option value="">Chọn dòng PO</option>{order.items.map(i=><option key={i.id} value={i.id}>{i.ingredientId} · còn {remaining(i)}</option>)}</select></label>
        <label>Loại sai lệch<select value={category} onChange={e=>{setCategory(e.target.value as typeof category);if(e.target.value!=='OVER_DELIVERY')setAccepted('0');}}><option value="OVER_DELIVERY">Giao vượt</option><option value="WRONG_INGREDIENT">Sai nguyên liệu</option><option value="DAMAGED">Hàng hỏng</option><option value="SHELF_LIFE">Hạn dùng không đạt</option></select></label>
        {category==='WRONG_INGREDIENT'&&<label>Nguyên liệu thực nhận<select value={observedIngredient} onChange={e=>setObservedIngredient(e.target.value)}><option value="">Chọn nguyên liệu sai khác</option>{ingredients.map(i=><option value={i.id} key={i.id}>{i.name}</option>)}</select></label>}
        <label>Lượng quan sát<input type="number" step="1" min="1" value={observed} onChange={e=>setObserved(e.target.value)}/></label>
        {category==='OVER_DELIVERY'&&<label>Lượng chấp nhận (không vượt phần còn lại)<input type="number" min="0" step="1" value={accepted} onChange={e=>setAccepted(e.target.value)}/></label>}
        <p>Lượng giữ/từ chối dự kiến: {Number(observed)-Number(accepted)}. Chỉ ghi nhận chứng cứ, không nhập kho.</p>
        <label>Lý do<input value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy||!!pending||!['CONFIRMED','PARTIALLY_RECEIVED'].includes(order.status)} onClick={()=>{
          const item=order.items.find(x=>x.id===discrepancyItem);
          if(!item||!positiveInt(observed)||!Number.isInteger(Number(accepted))||Number(accepted)<0||
            Number(accepted)>Number(observed)||Number(accepted)>remaining(item)||!reason.trim()||
            (category!=='OVER_DELIVERY'&&Number(accepted)!==0)|| (category==='OVER_DELIVERY'&&Number(observed)<=remaining(item))||
            (category==='WRONG_INGREDIENT'&&(!observedIngredient||observedIngredient===item.ingredientId))){
            setError('Chênh lệch chưa hợp lệ: kiểm tra lượng giữ, phần còn lại và nguyên liệu thực nhận.');return;
          }
          const id=order.id,body:PurchasingDiscrepancy={requestId:uuid(),purchaseOrderItemId:discrepancyItem,category,
            observedQuantity:Number(observed),acceptedQuantity:Number(accepted),rejectedQuantity:Number(observed)-Number(accepted),
            reason:reason.trim(),...(category==='WRONG_INGREDIENT'?{observedIngredientId:observedIngredient}:{})};
          run({label:'Ghi nhận sai lệch',orderId:id,body,run:()=>purchasingApi.discrepancy(id,body)});
        }}>Ghi nhận sai lệch (HELD)</button>
      </div>}
      {tab==='return'&&isAdmin&&<div className="pur-form"><h2>06 · Trả nhà cung cấp</h2><p>Chỉ trả lô có chứng từ nhập và tồn vật lý hợp lệ. Backend tạo RETURN_OUT; công nợ vẫn UNSETTLED.</p>
        <label>Phiếu nhận hàng<select value={returnReceipt} onChange={e=>setReturnReceipt(e.target.value)}><option value="">Chọn phiếu nhận</option>{order.receipts.map(r=><option value={r.id} key={r.id}>{r.id} · {new Date(r.receivedAt).toLocaleDateString('vi-VN')}</option>)}</select></label>
        <label>ID lô nguồn (đối chiếu từ lịch sử lô)<input value={returnBatch} onChange={e=>setReturnBatch(e.target.value)}/></label><label>Số lượng trả<input type="number" min="0.001" step="0.001" value={returnQty} onChange={e=>setReturnQty(e.target.value)}/></label>
        <label>Lý do<input value={reason} onChange={e=>setReason(e.target.value)}/></label>
        <button disabled={busy||!!pending} onClick={()=>{
          if(!returnReceipt||!returnBatch.trim()||!reason.trim()||!Number.isFinite(Number(returnQty))||Number(returnQty)<=0||
            Math.abs(Number(returnQty)*1000-Math.round(Number(returnQty)*1000))>.00001){setError('Chọn chứng từ nhận, ID lô, số lượng tối đa 3 số thập phân và lý do.');return;}
          const id=order.id,body={requestId:uuid(),goodsReceiptId:returnReceipt,batchId:returnBatch.trim(),quantity:Number(returnQty),reason:reason.trim()};
          run({label:'Trả NCC',orderId:id,body,run:()=>purchasingApi.supplierReturn(id,body)});
        }}>Ghi nhận trả hàng (UNSETTLED)</button>
      </div>}
      {tab==='invoice'&&isAdmin&&<div className="pur-form"><h2>07 · Đối soát hóa đơn</h2><p>So sánh theo PO và số lượng đã nhận. Đối soát KHÔNG có nghĩa đã thanh toán.</p>
        <label>Số hóa đơn<input value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)}/></label><p>Tiền tệ: {order.currency}</p>
        {order.items.map(i=>{const d=invoiceDraft[i.id]??{quantity:String(i.quantityReceived),unitPrice:String(i.unitPrice),total:String(i.quantityReceived*Number(i.unitPrice))};
          return <fieldset key={i.id}><legend>{i.ingredientId} · PO: {i.quantityOrdered} {i.unit} · Đã nhận: {i.quantityReceived} · Giá PO: {i.unitPrice}</legend>
            <div className="pur-batch">{(['quantity','unitPrice','total'] as const).map(field=><label key={field}>{({quantity:'Lượng hóa đơn',unitPrice:'Đơn giá hóa đơn',total:'Tổng hóa đơn'})[field]}<input type="number" min="0" step={field==='quantity'?'1':'0.01'} value={d[field]} onChange={e=>setInvoiceDraft(old=>({...old,[i.id]:{...d,[field]:e.target.value}}))}/></label>)}</div>
          </fieldset>;})}
        <button disabled={busy||!!pending} onClick={submitInvoice}>Đối soát hóa đơn (không thanh toán)</button>
      </div>}
      <h2>Lịch sử & chứng cứ trên máy chủ</h2>
      {order.events.map(ev=><details key={ev.id}><summary>{ev.type} · {new Date(ev.createdAt).toLocaleString('vi-VN')} · {ev.actorId}</summary><pre>{JSON.stringify(ev.details,null,2)}</pre></details>)}
      <div className="pur-audit"><div><h3>Phiếu nhận</h3>{order.receipts.map(x=><p key={x.id}>{x.id} · {new Date(x.receivedAt).toLocaleString('vi-VN')}</p>)}</div>
        <div><h3>Sai lệch</h3>{order.discrepancies.map(x=><p key={x.id}>{x.category} · {x.status} · {x.reason}</p>)}</div>
        <div><h3>Trả hàng</h3>{order.supplierReturns.map(x=><p key={x.id}>{x.batchId} · {x.quantity} · UNSETTLED</p>)}</div>
        <div><h3>Đối soát hóa đơn</h3>{order.invoices.map(x=><p key={x.id}>{x.invoiceNumber} · {x.status} · Không phê duyệt thanh toán</p>)}</div></div>
    </section>}
  </div>;
}

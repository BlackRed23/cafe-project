import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MockApiError, MockCommand, MockClient } from '../api/mock-client';
import { mockApi, mockTokenKey } from './config';
import { actions, defaults, isFieldGroup, payload, versionGuards } from './commands';
import type { Action, Area, Field, Values } from './commands';
import './mock.css';

const titles: Record<Area, string> = { menu: 'Menu & Recipes', inventory: 'Inventory', orders: 'Orders', purchases: 'Purchases & Receipts', counts: 'Stock Counts', payments: 'Payments & Refunds', agent: 'Agent & Memory Learning' };
const paths: Record<Area, string> = { menu: '/admin/products', inventory: '/admin/inventory', orders: '/admin/orders', purchases: '/admin/purchase-requests', counts: '/admin/stock-counts', payments: '/admin/payments', agent: '/admin/agent-logs' };
const message = (e: unknown) => e instanceof Error ? e.message : 'Request failed';
const agentMessage = (e: unknown) => e instanceof MockApiError && [401, 403].includes(e.status)
  ? 'Unauthorized: ' + message(e) : message(e);
export function MockLayout() {
  const { user, logout } = useAuth();
  return <div className="mock-shell"><header><strong>Cafe · Mock workspace</strong><span>{user?.email} · {user?.role}</span><button onClick={logout}>Sign out</button></header>
    <p className="mock-banner">Local in-memory fixtures · PostgreSQL unverified · Mock payment events and MockLLM only</p>
    <nav aria-label="Business workflows">{Object.entries(paths).map(([area, path]) => <Link key={area} to={path}>{titles[area as Area]}</Link>)}</nav>
    <main><Outlet /></main></div>;
}
export function MockLogin() {
  const [token, setToken] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <main className="mock-shell mock-login"><h1>Mock workspace sign in</h1><p>Paste a local mock token issued by the API token command. Fixture roles and permissions are checked by the server.</p>
    <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError('');
      // Validate candidate before replacing current session. Never store failed credentials.
      try { const client = new MockClient('mock', () => token.trim()); const user = await client.request<{ role: string }>('/session');
        if (!['ADMIN', 'STAFF'].includes(user.role)) throw new Error('This workspace requires STAFF or ADMIN.');
        localStorage.setItem(mockTokenKey, token.trim()); window.location.assign('/admin/dashboard');
      } catch (err) { setError(message(err)); } finally { setBusy(false); }
    }}><label>Local mock bearer token<input type="password" autoComplete="off" required value={token} onChange={e => setToken(e.target.value)} /></label><button disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button></form>{error && <p role="alert">{error}</p>}</main>;
}

/** Readable nested business records, including allocations, approvals and audit evidence. */
export function RecordDetails({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span>—</span>;
  if (Array.isArray(value)) return value.length ? <ol>{value.map((v, i) => <li key={i}><RecordDetails value={v} /></li>)}</ol> : <span>None</span>;
  if (typeof value === 'object') return <dl>{Object.entries(value).map(([key, v]) => <div key={key}><dt>{key.replace(/([A-Z])/g, ' $1')}</dt><dd><RecordDetails value={v} /></dd></div>)}</dl>;
  return <span>{String(value)}</span>;
}
type ReplenishmentStep = { id: string; tool: string; dependsOn: string[] };
type AgentInspection = {
  execution: Values;
  approvals: { hash: string; revoked: boolean; consumed: boolean; expiresAt: string }[];
  toolCalls: { stepId?: string; status: string }[];
  evaluations: { id: string; passed: boolean; code: string }[];
  audit: unknown;
};
function isReplenishment(value: unknown): value is Values {
  const plan = (value as Values | undefined)?.plan;
  return Array.isArray(plan) && plan.length === 6 && plan[4]?.id === 'approval' && plan[5]?.id === 'purchase';
}
function ReplenishmentReview({ inspection }: { inspection: AgentInspection }) {
  const { execution, approvals, toolCalls, evaluations, audit } = inspection;
  const { plan, result, status, hash, versions } = execution;
  const matching = approvals.filter(a => a.hash === hash && !a.consumed);
  const current = matching.filter(a => !a.revoked);
  const approvalStatus = current.some(a => Date.parse(a.expiresAt) > Date.now()) ? 'Approved'
    : current.length ? 'Approval expired. An ADMIN must review and approve again.'
    : matching.length ? 'Approval revoked. A new ADMIN approval is required.' : 'Waiting for exact-hash ADMIN approval.';
  const outputs = ['Inventory snapshot', 'Inventory analysis', 'Recommended quantities and unit costs', 'Prepared purchase proposal', 'Approval request', 'Purchase result'];
  return <>
    <p>Execution {execution.id} · <strong>{status}</strong></p>
    {status === 'AWAITING_APPROVAL' && <p role="status">{approvalStatus}</p>}
    {status === 'UNKNOWN' && <p role="alert">Purchase outcome UNKNOWN. Recover the original receipt to check whether the purchase committed.</p>}
    {status === 'CANCELLED' && <p role="status">Replenishment cancelled.</p>}
    {status === 'FAILED' && <p role="alert">Replenishment failed. {evaluations.filter(e => !e.passed).map(e => e.code).join(', ')}</p>}
    <h3>Six execution steps</h3>
    <ol aria-label="Six execution steps">{(plan as ReplenishmentStep[]).map((step, index) => <li key={step.id}>
      <h4>{outputs[index]}</h4>
      <p>{step.tool} · {toolCalls.find(call => call.stepId === step.id)?.status ?? 'PENDING'}</p>
      <p>Depends on {step.dependsOn.join(', ') || 'none'}</p>
      {index < result.length && <RecordDetails value={result[index]} />}
    </li>)}</ol>
    <details open={status === 'AWAITING_APPROVAL'}><summary>Exact proposal hash, source versions and approval history</summary>
      <RecordDetails value={{ hash, versions, approvals }} />
    </details>
    <details><summary>Execution audit</summary><RecordDetails value={{ toolCalls, evaluations, audit }} /></details>
  </>;
}
function Records({ title, rows, selected, onSelect }: { title: string; rows: Values[]; selected?: string; onSelect?: (row: Values) => void }) {
  return <section><h2>{title} ({rows.length})</h2>{!rows.length ? <p>No records yet.</p> : <ul className="mock-records">{rows.map((row, i) => <li key={row.id ?? i}>
    <details open={selected === row.id}><summary>{row.name ?? row.text ?? row.id ?? row.ingredientId ?? `Record ${i + 1}`} {row.status && <b> · {row.status}</b>} {row.version && <span> · v{row.version}</span>}</summary>
      {onSelect && <button type="button" onClick={() => onSelect(row)}>Use this record</button>}<RecordDetails value={row} /></details></li>)}</ul>}</section>;
}
function Fields({ fields, values, onChange, data, prefix = 'form', disabled = false }: { fields: Field[]; values: Values; onChange: (v: Values) => void; data: Values; prefix?: string; disabled?: boolean }) {
  const update = (f: Field, value: unknown) => onChange({ ...values, [f.key]: value });
  return <>{fields.map(f => {
    const id = `${prefix}-${f.key}`; const value = values[f.key];
    if (f.fields) {
      if (isFieldGroup(f)) return <fieldset key={id} disabled={disabled}><legend>{f.label}</legend><Fields fields={f.fields} values={value} onChange={v => update(f, v)} data={data} prefix={id} disabled={disabled} /></fieldset>;
      return <fieldset key={id} disabled={disabled}><legend>{f.label}</legend>{value.map((row: Values, index: number) => <div className="mock-line" key={index}><Fields fields={f.fields!} values={row} onChange={v => update(f, value.map((r: Values, i: number) => i === index ? v : r))} data={data} prefix={`${id}-${index}`} disabled={disabled} /><button type="button" aria-label={`Remove ${f.label} ${index + 1}`} disabled={disabled || value.length <= (f.optional ? 0 : 1)} onClick={() => update(f, value.filter((_: unknown, i: number) => i !== index))}>Remove line</button></div>)}<button type="button" disabled={disabled || value.length >= 100} onClick={() => update(f, [...value, defaults(f.fields!)])}>Add {f.label}</button></fieldset>;
    }
    const options = f.ref ? [...new Set((data[f.ref] ?? []).map((r: Values) => f.ref === 'quotes' ? r.supplierId : r.id))] as string[] : [];
    return <label key={id} htmlFor={id}>{f.label}{f.optional ? ' (optional)' : ''}
      {f.options ? <select aria-label={f.label} id={id} disabled={disabled} value={value} onChange={e => update(f, e.target.value)}>{f.options.map(option => <option key={option}>{option}</option>)}</select>
        : f.kind === 'boolean' ? <input aria-label={f.label} id={id} type="checkbox" disabled={disabled} checked={value} onChange={e => update(f, e.target.checked)} />
          : <input aria-label={f.label} id={id} disabled={disabled} value={value} required={!f.optional} list={options.length ? `${id}-options` : undefined}
            type={f.kind === 'date' ? 'date' : 'text'} inputMode={['decimal', 'integer'].includes(f.kind ?? '') ? 'decimal' : undefined}
            pattern={f.kind === 'decimal' ? '(0|[1-9][0-9]*)([.][0-9]{1,4})?' : f.kind === 'integer' ? '[0-9]+' : undefined}
            maxLength={f.key === 'text' ? 4000 : 1000} onChange={e => update(f, e.target.value)} />}
      {options.length > 0 && <datalist id={`${id}-options`}>{options.map(v => <option key={v} value={v} />)}</datalist>}
    </label>;
  })}</>;
}
export function MockWorkspace({ area }: { area: Area }) {
  const { isAdmin, user } = useAuth(); const params = useParams();
  const storageKey = 'mock_pending:' + user?.id + ':' + area;
  const permitted = actions[area].filter(a => !a.admin || isAdmin);
  const [resume] = useState(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
      if (saved && permitted.some(a => a.path === saved.path && a.label === saved.actionLabel) && saved.key && saved.values && saved.input && saved.versions) return saved;
    } catch { /* Invalid local recovery record cannot execute. */ }
    return null;
  });
  const [actionIndex, setActionIndex] = useState(() => resume ? permitted.findIndex(a => a.path === resume.path && a.label === resume.actionLabel) : 0); const action = permitted[actionIndex];
  const [values, setValues] = useState<Values>(() => resume?.values ?? (action ? defaults(action.fields) : {}));
  const [data, setData] = useState<Values>({}); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [result, setResult] = useState<unknown>(); const [notice, setNotice] = useState('');
  const [inspection, setInspection] = useState<AgentInspection>(); const [reviewed, setReviewed] = useState(false); const [query, setQuery] = useState('');
  const pending = useRef<MockCommand | null>(resume ? new MockCommand(resume.path, resume.input, resume.versions, resume.key) : null); const loadId = useRef(0);
  const denied = area === 'payments' && !isAdmin;
  async function load() {
    const generation = ++loadId.current; setLoading(true); setError('');
    try {
      const [menu, inventory, orders, purchasing, counts, payments, executions, memories, recommendations] = await Promise.all([
        mockApi!.request('/menu'), mockApi!.request<Values>('/views/inventory'), mockApi!.request('/views/orders'), mockApi!.request<Values>('/views/purchases'), mockApi!.request('/views/counts'),
        isAdmin ? mockApi!.request<Values>('/views/payments') : Promise.resolve({}),
        area === 'agent' ? mockApi!.request('/agent/executions') : Promise.resolve([]),
        area === 'agent' ? mockApi!.request('/agent/memory?q=' + encodeURIComponent(query)) : Promise.resolve([]),
        area === 'inventory' ? mockApi!.request('/inventory/recommendations') : Promise.resolve([]),
      ]);
      if (generation === loadId.current) setData({ menu, ...inventory, orders, ...purchasing, counts, ...payments, executions, memories, recommendations });
    } catch (err) { if (generation === loadId.current) setError(area === 'agent' ? agentMessage(err) : message(err)); }
    finally { if (generation === loadId.current) setLoading(false); }
  }
  useEffect(() => { if (!denied) void load(); else setLoading(false); return () => { ++loadId.current; }; }, [area, isAdmin]);
  async function readInspection(executionId: string) {
    const details = await mockApi!.request<AgentInspection>('/agent/executions/' + encodeURIComponent(executionId));
    setInspection(details); setValues(v => ({ ...v, executionId, expectedHash: details.execution.hash, expectedRevision: details.execution.revision }));
  }
  async function inspect(executionId: string) {
    setBusy(true); setReviewed(false); setInspection(undefined); setError('');
    try {
      await readInspection(executionId);
    } catch (err) { setError(agentMessage(err)); } finally { setBusy(false); }
  }
  function choose(index: number) { if (pending.current) return; setActionIndex(index); setValues(defaults(permitted[index].fields)); setInspection(undefined); setReviewed(false); setError(''); setNotice(''); setResult(undefined); }
  const replenishment = isReplenishment(inspection?.execution) ? inspection : undefined;
  const approvalReady = !!pending.current || action?.path !== '/agent/approve' || (reviewed && inspection?.execution.id === values.executionId &&
    inspection?.execution.hash === values.expectedHash && (!replenishment || replenishment.execution.status === 'AWAITING_APPROVAL'));
  async function submit(commandAction: Action, formValues: Values) {
    setBusy(true); setError(''); setNotice('');
    const replay = !!pending.current;
    try {
      if (!pending.current) {
        const input = payload(commandAction.fields, formValues);
        pending.current = new MockCommand(commandAction.path, input, versionGuards(input, data));
        sessionStorage.setItem(storageKey, JSON.stringify({ ...pending.current, values: formValues, actionLabel: commandAction.label }));
      }
      const response = await pending.current.run<Values | null>(mockApi!);
      pending.current = null; sessionStorage.removeItem(storageKey); setResult(response);
      setNotice(replay && area === 'agent' ? 'Saved in mock memory. Retried the original command with the same key.' : 'Saved in mock memory.');
      const executionId = isReplenishment(response) ? response.id
        : replenishment?.execution.id === formValues.executionId ? replenishment?.execution.id : undefined;
      setInspection(undefined); setReviewed(false); await load();
      if (executionId) await readInspection(executionId);
    } catch (err) {
      if (err instanceof MockApiError && err.status >= 400 && err.status < 500) { pending.current = null; sessionStorage.removeItem(storageKey); }
      setError(area === 'agent' ? agentMessage(err) : message(err));
    } finally { setBusy(false); }
  }
  function replenishmentAction(path: '/agent/execute' | '/agent/cancel' | '/agent/approve') {
    const index = permitted.findIndex(a => a.path === path);
    if (!replenishment || index < 0 || pending.current || busy) return;
    const { id: executionId, hash: expectedHash } = replenishment.execution;
    const formValues = { ...defaults(permitted[index].fields), executionId, expectedHash };
    setActionIndex(index); setValues(formValues); setReviewed(false); setError('');
    if (path !== '/agent/approve') void submit(permitted[index], formValues);
  }
  if (denied) return <section className="mock-workspace"><h1>{titles[area]}</h1><p role="alert">Unauthorized: payment workflows require ADMIN.</p></section>;
  const selected = params.id ?? params.inventoryId;
  const groups: Record<Area, string[]> = { menu: ['menu'], inventory: ['ingredients', 'lots', 'recommendations', 'events'], orders: ['orders'], purchases: ['purchases', 'receipts', 'balances', 'quotes'], counts: ['counts'], payments: ['payments', 'reconciliations'], agent: ['executions', 'memories'] };
  const useRecord = (row: Values) => {
    if (busy || pending.current || !action) return;
    if (area === 'agent' && row.text) { setValues(v => ({ ...v, memoryId: row.id })); return; }
    if (area === 'agent' && row.plan) { void inspect(row.id); return; }
    const key = area === 'menu' ? 'productId' : area === 'orders' ? 'orderId' : area === 'payments' ? 'paymentId' : area === 'counts' ? 'countId' : row.purchaseId ? 'receiptId' : area === 'inventory' ? 'ingredientId' : 'purchaseId';
    setValues(v => ({ ...v, [key]: row.id }));
    if (action.path === '/menu/draft') {
      if (row.draft) setValues({ productId: row.id, name: row.name, price: row.price, ...row.draft });
      else { setBusy(true); mockApi!.request<Values[]>('/recipes/' + row.id).then(recipes => { const recipe = recipes.find(r => r.active); if (recipe) setValues({ productId: row.id, name: row.name, price: row.price, yieldQuantity: recipe.yieldQuantity, ingredients: recipe.ingredients }); }).catch(e => setError(message(e))).finally(() => setBusy(false)); }
    }
  };
  return <div className="mock-workspace"><div className="mock-heading"><h1>{titles[area]}</h1><button disabled={busy || loading || !!pending.current} onClick={() => {
    void load();
    if (replenishment) void inspect(replenishment.execution.id);
  }}>Refresh</button></div>
    {loading && <p role="status">Loading {titles[area]}…</p>}{error && <p role="alert">{error}{error === 'STALE_VERSION' && ' — Refresh records and review current values.'}</p>}{notice && <p role="status">{notice}</p>}
    {pending.current && <p role="alert">Result uncertain. Inputs are frozen. Retry the same operation to recover its receipt; inspect records before starting another operation.</p>}
    {area === 'agent' && <form onSubmit={e => { e.preventDefault(); void load(); }}><label>Search own memories<input value={query} onChange={e => setQuery(e.target.value)} /></label><button disabled={busy}>Search memories</button></form>}
    {action ? <form className="mock-form" onSubmit={e => { e.preventDefault(); if (approvalReady) void submit(action, values); }}><label>Workflow<select aria-label="Workflow" value={actionIndex} disabled={busy || !!pending.current} onChange={e => choose(Number(e.target.value))}>{permitted.map((a, i) => <option value={i} key={a.label}>{a.label}</option>)}</select></label>
      <Fields fields={action.fields} values={values} onChange={v => { setValues(v); setReviewed(false); }} data={data} disabled={busy || !!pending.current} />
      {area === 'agent' && values.executionId && <button type="button" disabled={busy || !!pending.current} onClick={() => void inspect(values.executionId)}>Inspect proposal and approval history</button>}
      {inspection && <section aria-label="Proposal review"><h2>Proposal review</h2>
        {replenishment ? <ReplenishmentReview inspection={replenishment} /> : <RecordDetails value={inspection} />}
        {replenishment && !pending.current && <div aria-label="Replenishment controls">
          {replenishment.execution.actorId === user?.id && <>
            {['PLANNED', 'AWAITING_APPROVAL', 'UNKNOWN'].includes(replenishment.execution.status) && <button type="button" disabled={busy || loading} onClick={() => replenishmentAction('/agent/execute')}>
              {replenishment.execution.status === 'UNKNOWN' ? 'Recover purchase receipt' : replenishment.execution.status === 'PLANNED' ? 'Analyze inventory and request approval' : 'Execute replenishment'}
            </button>}
            {['PLANNED', 'AWAITING_APPROVAL'].includes(replenishment.execution.status) && <button type="button" disabled={busy || loading} onClick={() => replenishmentAction('/agent/cancel')}>Cancel this replenishment</button>}
          </>}
          {isAdmin && replenishment.execution.status === 'AWAITING_APPROVAL' && action.path !== '/agent/approve' &&
            <button type="button" disabled={busy || loading} onClick={() => replenishmentAction('/agent/approve')}>Review for ADMIN approval</button>}
        </div>}
        {action.path === '/agent/approve' && <label><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I reviewed this exact proposal, hash and source versions</label>}
      </section>}
      <button disabled={busy || loading || !!error && !Object.keys(data).length || !approvalReady}>{busy ? 'Saving…' : pending.current ? 'Retry same operation' : action.label}</button>
    </form> : <p>No write permission for this workflow.</p>}
    {result !== undefined && <section aria-label="Last operation result"><h2>Last operation result</h2><RecordDetails value={result} /></section>}
    {!loading && groups[area].map(group => <Records key={group} title={group} rows={data[group] ?? []} selected={selected} onSelect={['menu', 'ingredients', 'orders', 'purchases', 'receipts', 'counts', 'payments', 'executions', 'memories'].includes(group) ? useRecord : undefined} />)}
  </div>;
}

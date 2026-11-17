import { useEffect, useRef, useState } from 'react';
import { recipesApi } from '../../api/recipes.api';
import { ingredientsApi } from '../../api/ingredients.api';
import type { Ingredient } from '../../types/ingredient.types';
import type { Recipe, PreviewRecipeCostResponse } from '../../types/recipe.types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Alert } from '../../components/common/Alert';
import { Loading } from '../../components/common/Loading';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { formatCurrency } from '../../utils/formatCurrency';
import { normalizedQuantity, recipeError, recipeUnits, validateRecipe } from './recipeForm';
import type { RecipeDraft } from './recipeForm';
import './recipes.css';

interface Props {
  productId: string;
  productName: string;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onChanged?: () => void;
}
const emptyDraft = (): RecipeDraft => ({ yieldQuantity: 1, laborCost: 0, overheadCost: 0, note: '', ingredients: [] });

export function RecipeManager({ productId, productName, disabled = false, onBusyChange, onChanged }: Props) {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [versions, setVersions] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [active, setActive] = useState<Recipe | null>(null);
  const [draft, setDraft] = useState<RecipeDraft>(emptyDraft);
  const [preview, setPreview] = useState<PreviewRecipeCostResponse | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<'preview' | 'create' | 'activate' | null>(null);
  const [confirmation, setConfirmation] = useState<Recipe | 'create' | null>(null);
  const [ambiguous, setAmbiguous] = useState(false);
  const lock = useRef(false);
  const loadSequence = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const sequence = ++loadSequence.current;
    async function load() {
      setLoading(true);
      setReady(false);
      setError('');
      try {
        const [list, available] = await Promise.all([recipesApi.getRecipesByProduct(productId), ingredientsApi.getIngredients()]);
        const current = list.find(recipe => recipe.isActive) ?? null;
        // Active endpoint is verified for ADMIN only; STAFF reads active flag in list.
        const confirmed = isAdmin && current ? await recipesApi.getActiveRecipe(productId) : current;
        if (cancelled || sequence !== loadSequence.current) return;
        setVersions(list);
        setIngredients(available);
        setActive(confirmed);
        setReady(true);
        setAmbiguous(false);
      } catch (failure) {
        if (!cancelled) setError(recipeError(failure));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [productId, isAdmin, reload]);

  function change(next: RecipeDraft) {
    setDraft(next);
    setPreview(null);
    setErrors({});
  }
  function validate() {
    const issues = validateRecipe(draft, ingredients);
    setErrors(issues);
    return Object.keys(issues).length === 0;
  }
  async function request(action: 'preview' | 'create' | 'activate', recipe?: Recipe) {
    if (lock.current || disabled || !ready || (action !== 'preview' && (!isAdmin || ambiguous))) return;
    if (action !== 'activate' && !validate()) return;
    lock.current = true;
    setBusy(action);
    onBusyChange?.(true);
    setError('');
    try {
      if (action === 'preview') {
        const { note: _note, ...payload } = draft;
        void _note;
        const result = await recipesApi.previewRecipeCost(productId, payload);
        setPreview(result);
        toast.success('Đã tính chi phí xem trước. Công thức chưa được lưu.');
      } else {
        const result = action === 'create'
          ? await recipesApi.createRecipeVersion(productId, draft)
          : await recipesApi.activateRecipeVersion(productId, recipe!.id);
        // Never edit existing version content or invent a concurrency field.
        setVersions(previous => [result, ...previous.filter(item => item.id !== result.id).map(item => result.isActive ? { ...item, isActive: false } : item)].sort((a, b) => b.version - a.version));
        if (result.isActive) setActive(result);
        setPreview(null);
        toast.success(action === 'create' ? `Đã tạo công thức phiên bản ${result.version}.` : `Đã kích hoạt công thức phiên bản ${result.version}.`);
        onChanged?.();
        setReload(value => value + 1);
      }
      setConfirmation(null);
    } catch (failure) {
      const message = recipeError(failure);
      setError(message);
      toast.error(message);
      // A lost write response can follow a committed version. Require read before retry.
      if (action !== 'preview') setAmbiguous(true);
    } finally {
      lock.current = false;
      setBusy(null);
      onBusyChange?.(false);
    }
  }
  function copyVersion(recipe: Recipe) {
    change({ yieldQuantity: recipe.yieldQuantity, laborCost: recipe.laborCost, overheadCost: recipe.overheadCost, note: recipe.note ?? '', ingredients: recipe.ingredients.map(({ ingredientId, quantity, unit, isOptional, allowSubstitute, note }) => ({ ingredientId, quantity, unit, isOptional, allowSubstitute, note })) });
  }
  const blocked = disabled || !!busy || !ready;
  return (
    <section className="recipe-manager" aria-label={`Công thức — ${productName}`} aria-busy={loading || !!busy}>
      <header className="recipe-heading">
        <div><p className="recipe-eyebrow">COFFEE INV / Nghệ thuật pha</p><h2>Công thức & định lượng</h2><p>{productName} · Mỗi thay đổi được lưu thành phiên bản mới.</p></div>
        <Button variant="outline" disabled={!!busy || loading} onClick={() => setReload(value => value + 1)}>Tải lại công thức</Button>
      </header>
      {error && <Alert tone="danger" title="Chưa thể hoàn tất">{error}</Alert>}
      {ambiguous && <Alert tone="warning">Nội dung đang nhập được giữ nguyên. Tải lại danh sách trước khi gửi lại thao tác ghi.</Alert>}
      {loading && <div role="status"><Loading message="Đang tải công thức và nguyên liệu…" /></div>}
      {!loading && ready && <>
        <div className="recipe-active"><span className="recipe-eyebrow">Đang áp dụng</span><h3>{active ? `Phiên bản ${active.version}` : 'Chưa có công thức đang hoạt động'}</h3>{active && <p>{active.ingredients.length} nguyên liệu · {active.yieldQuantity} phần / mẻ · {formatCurrency(active.costSummary.unitCost)} / phần</p>}</div>
        <div className="recipe-section-title"><h3>{isAdmin ? 'Soạn phiên bản mới' : 'Thử định lượng & xem chi phí'}</h3><p>Xem trước không lưu và không thay đổi tồn kho.</p></div>
        <fieldset disabled={blocked} className="recipe-editor">
          <div className="recipe-fields">
            {(['yieldQuantity', 'laborCost', 'overheadCost'] as const).map(key => <Input key={key} label={key === 'yieldQuantity' ? 'Sản lượng (phần / mẻ)' : key === 'laborCost' ? 'Chi phí nhân công (VND)' : 'Chi phí chung (VND)'} type="number" min={key === 'yieldQuantity' ? '0.000001' : '0'} step="any" value={Number.isNaN(draft[key]) ? '' : draft[key]} onChange={event => change({ ...draft, [key]: event.target.value === '' ? NaN : Number(event.target.value) })} error={errors[key]} />)}
          </div>
          {errors.ingredients && <Alert tone="danger">{errors.ingredients}</Alert>}
          {!ingredients.some(item => item.isActive) && <Alert tone="warning">Chưa có nguyên liệu đang hoạt động để chọn.</Alert>}
          <div className="recipe-rows">
            {draft.ingredients.map((row, index) => {
              const ingredient = ingredients.find(item => item.id === row.ingredientId);
              const normalized = ingredient ? normalizedQuantity(row.quantity, row.unit, ingredient.baseUnit) : null;
              const update = (patch: Partial<typeof row>) => change({ ...draft, ingredients: draft.ingredients.map((item, position) => position === index ? { ...item, ...patch } : item) });
              return <div key={index} className="recipe-row">
                <label>Nguyên liệu {index + 1}<select aria-label={`Nguyên liệu ${index + 1}`} value={row.ingredientId} aria-invalid={!!errors[`row-${index}`]} aria-describedby={errors[`row-${index}`] ? `recipe-row-${index}-error` : undefined} onChange={event => { const selected = ingredients.find(item => item.id === event.target.value); update({ ingredientId: event.target.value, unit: selected?.baseUnit ?? '' }); }}><option value="">Chọn nguyên liệu</option>{ingredient && !ingredient.isActive && <option value={ingredient.id} disabled>{ingredient.name} · ngưng dùng</option>}{!ingredient && row.ingredientId && <option value={row.ingredientId} disabled>Nguyên liệu không còn khả dụng</option>}{ingredients.filter(item => item.isActive).map(item => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}</select></label>
                <Input label={`Định lượng ${index + 1}`} type="number" min="0.000001" step="any" value={Number.isNaN(row.quantity) ? '' : row.quantity} onChange={event => update({ quantity: event.target.value === '' ? NaN : Number(event.target.value) })} />
                <label>Đơn vị<select aria-label={`Đơn vị ${index + 1}`} value={row.unit} onChange={event => update({ unit: event.target.value })}><option value="">Chọn đơn vị</option>{row.unit && !recipeUnits(ingredient?.baseUnit ?? '').includes(row.unit) && <option value={row.unit} disabled>{row.unit} · không tương thích</option>}{recipeUnits(ingredient?.baseUnit ?? '').map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></label>
                <button type="button" aria-label={`Xóa dòng ${index + 1}`} className="recipe-remove" onClick={() => change({ ...draft, ingredients: draft.ingredients.filter((_, position) => position !== index) })}>Bỏ dòng</button>
                <p className="recipe-row-note">{normalized !== null && ingredient ? `Quy đổi: ${normalized.toLocaleString('vi-VN')} ${ingredient.baseUnit}` : 'Chọn nguyên liệu và đơn vị phù hợp.'}{row.isOptional ? ' · Nguyên liệu tùy chọn' : ''}{row.allowSubstitute ? ' · Cho phép thay thế' : ''}{row.note ? ` · ${row.note}` : ''}</p>
                {errors[`row-${index}`] && <p id={`recipe-row-${index}-error`} className="ds-field-error recipe-row-note">{errors[`row-${index}`]}</p>}
              </div>;
            })}
          </div>
          <Button type="button" variant="outline" onClick={() => change({ ...draft, ingredients: [...draft.ingredients, { ingredientId: '', quantity: NaN, unit: '' }] })}>+ Thêm nguyên liệu</Button>
          <Input label="Ghi chú phiên bản" maxLength={1000} value={draft.note ?? ''} onChange={event => change({ ...draft, note: event.target.value })} />
          <div className="recipe-actions"><Button type="button" variant="outline" isLoading={busy === 'preview'} onClick={() => void request('preview')}>Xem trước chi phí</Button>{isAdmin && <Button type="button" disabled={ambiguous} onClick={() => { if (validate()) setConfirmation('create'); }}>Tạo phiên bản mới</Button>}</div>
        </fieldset>
        {preview && <section className="recipe-cost" aria-label="Chi phí xem trước"><h3>Chi phí dự kiến</h3><p className="recipe-cost-total">{formatCurrency(preview.unitCost)} <small>/ phần</small></p><dl>{[['Nguyên liệu', preview.ingredientsCost], ['Nguyên liệu tùy chọn', preview.optionalIngredientsCost], ['Nhân công', preview.laborCost], ['Chi phí chung', preview.overheadCost], ['Tổng chi phí / mẻ', preview.totalBatchCost]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatCurrency(Number(value))}</dd></div>)}</dl><ul>{preview.breakdown.map((row, index) => <li key={row.ingredientId ?? index}>{row.ingredientName ?? ingredients.find(item => item.id === row.ingredientId)?.name ?? 'Nguyên liệu'} · {row.quantityBase} {row.baseUnit} · {formatCurrency(row.lineCost ?? 0)}</li>)}</ul><p>Xem trước theo giá nguyên liệu hiện tại; chưa lưu công thức.</p></section>}
        <section className="recipe-history"><div className="recipe-section-title"><h3>Lịch sử phiên bản</h3><p>Giữ nguyên nội dung cũ và công thức đã gắn với đơn hàng.</p></div>{!versions.length ? <p className="recipe-empty">Chưa có phiên bản công thức. Thêm nguyên liệu để bắt đầu.</p> : <ol>{versions.map(recipe => <li key={recipe.id}><div><span className="recipe-version">v{recipe.version}</span><span className="recipe-status" data-active={recipe.isActive}>{recipe.isActive ? 'Đang áp dụng' : 'Không hoạt động'}</span><p>{recipe.ingredients.length} nguyên liệu · {formatCurrency(recipe.costSummary.unitCost)} / phần</p><details><summary>Định lượng đã lưu</summary><ul>{recipe.ingredients.map((row, index) => <li key={row.id ?? index}>{row.ingredientName ?? row.ingredientId}: {row.quantity} {row.unit} → {row.quantityBase} {row.baseUnit}</li>)}</ul></details></div><div className="recipe-actions"><Button variant="outline" disabled={blocked} onClick={() => copyVersion(recipe)}>Dùng làm bản nháp</Button>{isAdmin && !recipe.isActive && <Button disabled={blocked || ambiguous} onClick={() => setConfirmation(recipe)}>Kích hoạt v{recipe.version}</Button>}</div></li>)}</ol>}</section>
      </>}
      <ConfirmDialog isOpen={confirmation !== null} onClose={() => { if (!lock.current) setConfirmation(null); }} onConfirm={() => confirmation === 'create' ? request('create') : confirmation ? request('activate', confirmation) : undefined} title={confirmation === 'create' ? 'Tạo phiên bản công thức mới?' : 'Kích hoạt phiên bản công thức?'} message={confirmation === 'create' ? 'Phiên bản mới sẽ được kích hoạt theo mặc định của API. Công thức đang áp dụng sẽ được thay thế; lịch sử đơn hàng đã xác nhận được giữ nguyên.' : 'Phiên bản được chọn sẽ thay thế công thức đang áp dụng cho các đơn hàng mới. Lịch sử đơn hàng đã xác nhận được giữ nguyên.'} confirmText={confirmation === 'create' ? 'Tạo phiên bản' : 'Kích hoạt'} isLoading={!!busy} />
    </section>
  );
}

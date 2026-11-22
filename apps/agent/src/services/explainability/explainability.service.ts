/**
 * Session H — deterministic, READ-only explanation of OBSERVABLE decisions.
 * NEVER explain a model's hidden reasoning. Never turn a proposal into approval.
 * Only the authenticated adapter may supply the snapshot.
 */
import { createHash } from 'node:crypto';
import { TOOL_CONTRACTS } from '../../workflows/tool-contracts';
import {
    EXP_CONTRACT_VERSION, explanationRequestSchema, explanationScopeSchema,
    explanationSnapshotSchema, explanationResultSchema,
    type ExplanationRequest, type ExplanationScope, type ExplanationSnapshot,
    type ExplanationAuthority, type ExplanationResult
} from './explainability.schema';

const digest = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const phases = ['PER', 'PLN', 'TOOL', 'ACT', 'OBS', 'ANM', 'REP', 'PUR', 'SEC'] as const;
const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
const amount = (s: string): bigint => {
    const [integer, fraction = ''] = s.split('.');
    return BigInt(integer) * 10000n + BigInt(fraction.padEnd(4, '0'));
};
const stockConsistent = (v: NonNullable<ExplanationSnapshot['inventory']>): boolean => {
    const physical = amount(v.physical), eligible = amount(v.eligible);
    const reserved = amount(v.reserved), available = amount(v.available);
    const excluded = amount(v.excludedExpired ?? '0') + amount(v.excludedQuality ?? '0');
    return physical >= eligible && eligible >= reserved &&
        available === eligible - reserved && excluded <= physical - eligible;
};

type ResultStatus = ExplanationResult['status'];
type FactKind = ExplanationResult['claims'][number]['kind'];
type HumanAction = ExplanationResult['requiredHumanAction'];

/** No free-form model text, arbitrary error messages or unapproved reason codes. */
const safePolicy: Record<NonNullable<ExplanationSnapshot['security']>['reason'], string> = {
    AUTHORIZED: 'Quyền truy cập đã được xác minh.',
    ADMIN_ONLY: 'Thao tác này chỉ dành cho ADMIN.',
    MISSING_PERMISSION: 'Tài khoản không có quyền cần thiết.',
    INVALID_SOURCE_ACTOR: 'Không xác minh được danh tính thực hiện nguồn.',
    PENDING_APPROVAL: 'Thao tác đang chờ phê duyệt hợp lệ.',
    STOCKTAKE_REJECTED: 'Điều chỉnh kiểm kê đã bị từ chối.',
    POLICY_HOLD: 'Quy trình tạm dừng theo chính sách an toàn.'
};
const replanText: Record<NonNullable<ExplanationSnapshot['replan']>['status'], string> = {
    KEEP_PLAN: 'Giữ kế hoạch đã được kiểm tra; chưa có quyền tự thực thi.',
    REFRESH_REQUIRED: 'Nguồn dữ liệu cần được đọc lại trước khi tiếp tục.',
    REPLAN_PROPOSED: 'Có đề xuất điều chỉnh kế hoạch; chưa được phê duyệt để thực hiện.',
    REVIEW_REQUIRED: 'Cần người có thẩm quyền xem xét kế hoạch.',
    HOLD: 'Quy trình lập lại kế hoạch đã tạm dừng an toàn.'
};
const purchasingText: Record<NonNullable<ExplanationSnapshot['purchasing']>['status'], string> = {
    NO_PURCHASE_NEEDED: 'Chưa có căn cứ đề xuất nhập thêm nguyên liệu.',
    RECOMMEND_PURCHASE: 'Hệ thống đề xuất nhập thêm; ADMIN phải xem xét trước khi thực hiện.',
    INSUFFICIENT_EVIDENCE: 'Chưa đủ bằng chứng để đề xuất nhập hàng.',
    REVIEW_REQUIRED: 'Cần rà soát đề xuất nhập hàng.',
    HOLD: 'Đề xuất nhập hàng đã tạm dừng vì điều kiện an toàn.',
    AWAITING_APPROVAL: 'Đề xuất nhập hàng đang chờ xem xét; đây chưa phải bằng chứng PurchaseRequest đã lưu.'
};
const toolPurpose: Partial<Record<keyof typeof TOOL_CONTRACTS, string>> = {
    getIngredientAvailability: 'đọc tồn kho tổng hợp',
    getIngredientBatches: 'đọc thông tin các lô',
    getRecipeRequirements: 'đọc định lượng công thức',
    getSalesHistory: 'đọc lịch sử bán hàng đủ điều kiện',
    getStocktakeStatus: 'đọc trạng thái kiểm kê',
    getInboundPurchaseOrder: 'đọc đơn nhập và bằng chứng nhận hàng',
    findIngredientSuppliers: 'đọc danh sách nhà cung cấp',
    calculateReorderQuantity: 'tính đề xuất lượng nhập',
    estimatePurchaseCost: 'ước tính chi phí tham khảo',
    createDraftPurchaseRequest: 'tạo yêu cầu nhập nháp, chức năng hiện bị chặn'
};

function base(request: ExplanationRequest, status: ResultStatus, message: string,
    reasons: string[], gaps: string[], scope?: ExplanationScope,
    snap?: ExplanationSnapshot): ExplanationResult {
    const sourceVerified = snap?.provenance === 'SOURCE_ATTESTED';
    const validEvents = snap?.evidence.filter(e => e.status === 'VERIFIED') ?? [];
    const refs = unique(validEvents.map(e => e.eventId));
    const proof = !!snap?.auditRef && !!snap?.checkpointRef &&
        validEvents.some(e => !!e.auditRef && !!e.checkpointRef);
    const completeness = sourceVerified && gaps.length === 0 && proof ? 'COMPLETE'
        : refs.length || snap ? 'PARTIAL' : 'MISSING';
    const versionConflict = gaps.some(g => [
        'SOURCE_VERSION_CONFLICT', 'ROW_VERSION_CONFLICT', 'MOVEMENT_CURSOR_CONFLICT',
        'INVENTORY_SOURCE_NOT_CORRELATED', 'CONTRADICTORY_STOCK'
    ].includes(g));
    const freshness = snap?.inventory && scope ?
        (Date.parse(snap.inventory.readAt) > Date.parse(scope.now) ||
            Date.parse(scope.now) - Date.parse(snap.inventory.readAt) > scope.maxAgeMs
            ? 'STALE' : sourceVerified && !versionConflict ? 'FRESH' : 'UNVERIFIED')
        : 'NOT_APPLICABLE';
    const result: ExplanationResult = {
        contractVersion: EXP_CONTRACT_VERSION,
        explanationId: digest([EXP_CONTRACT_VERSION, request.runId, request.decisionId,
            request.topic, snap?.auditRef ?? null, status, reasons, gaps]),
        runId: request.runId, graphId: request.graphId, decisionId: request.decisionId,
        topic: request.topic, status, messageVi: message,
        claims: [], reasonCodes: unique(reasons).slice(0, 40),
        verifiedEvidenceRefs: sourceVerified ? refs : [],
        evidenceGaps: unique(gaps).slice(0, 40),
        sourceFreshness: freshness,
        evidenceCompleteness: completeness,
        traceabilityLevel: sourceVerified && proof ? 'PERSISTED' :
            snap?.provenance === 'TEST_FIXTURE' ? 'CONTRACT_ONLY' : 'UNVERIFIED',
        policyBasis: sourceVerified ? (snap?.security?.policyRef ?? snap?.policyRef ?? null) : null,
        requiredHumanAction: 'NONE', limitations: unique([
            'EXPLANATION_NOT_AN_EXECUTION',
            ...(!sourceVerified ? ['NOT_SOURCE_ATTESTED'] : []),
            ...(!proof ? ['PERSISTED_AUDIT_OR_CHECKPOINT_MISSING'] : [])
        ]),
        readOnly: true, noWrite: true,
        authorizedToExecute: false, authorizedToApprove: false, authorizedToPurchase: false
    };
    return result;
}

/**
 * Authority MUST retrieve exact persisted decision + actor-scoped business evidence.
 * A service that merely echoes the request is not an acceptable production adapter.
 * A test adapter returns provenance TEST_FIXTURE, never SOURCE_ATTESTED.
 */
export async function explainDecision(rawRequest: unknown, rawScope: unknown,
    authority: ExplanationAuthority): Promise<ExplanationResult> {
    const requestParsed = explanationRequestSchema.safeParse(rawRequest);
    if (!requestParsed.success) throw new Error('INVALID_EXP_REQUEST');
    const request = requestParsed.data;
    const scopeParsed = explanationScopeSchema.safeParse(rawScope);
    if (!scopeParsed.success) throw new Error('INVALID_AUTHENTICATED_SCOPE');
    const scope = scopeParsed.data;
    const denied = () => base(request, 'ACCESS_DENIED',
        'Không có quyền xem thông tin giải thích quyết định này.',
        ['ACCESS_DENIED'], ['AUTHORIZATION_NOT_VERIFIED']);
    if (!scope.canReadDecision || request.runId !== scope.runId ||
        request.actorId !== scope.actorId || request.graphId !== scope.graphId) return denied();

    if (!authority || typeof authority.load !== 'function') {
        return base(request, 'INSUFFICIENT_EVIDENCE',
            'Chưa thể xác minh nguồn quyết định. Không có kết luận nghiệp vụ.',
            ['SOURCE_AUTHORITY_MISSING'], ['SOURCE_AUTHORITY_MISSING']);
    }
    let loaded: unknown;
    try {
        loaded = await authority.load(request, scope);
    } catch {
        return base(request, 'INSUFFICIENT_EVIDENCE',
            'Không đọc được bằng chứng đã xác thực; cần kiểm tra lại nguồn.',
            ['SOURCE_UNAVAILABLE'], ['SOURCE_UNAVAILABLE']);
    }
    const parsed = explanationSnapshotSchema.safeParse(loaded);
    if (!parsed.success) return base(request, 'INSUFFICIENT_EVIDENCE',
        'Dữ liệu nguồn không hợp lệ; không thể giải thích một cách chắc chắn.',
        ['INVALID_SOURCE_ENVELOPE'], ['INVALID_SOURCE_ENVELOPE']);
    const snap = parsed.data;
    if (snap.runId !== request.runId || snap.actorId !== request.actorId ||
        snap.graphId !== request.graphId || snap.decisionId !== request.decisionId) return denied();
    if (snap.evidence.some(e => e.runId !== request.runId || e.actorId !== request.actorId ||
        e.graphId !== request.graphId)) return denied();

    let status: ResultStatus = 'EXPLAINED';
    let message = '';
    let action: HumanAction = 'NONE';
    const reasons: string[] = [];
    const gaps: string[] = [];
    const claims: ExplanationResult['claims'] = [];
    const verified = snap.evidence.filter(e => e.status === 'VERIFIED');
    const refs = (phase?: typeof phases[number]): string[] => verified
        .filter(e => !phase || e.phase === phase).map(e => e.eventId);
    const proof = snap.provenance === 'SOURCE_ATTESTED';
    const claim = (kind: FactKind, textVi: string, evidenceRefs: string[]) => {
        const rendered = proof ? textVi : `Theo dữ liệu TEST_FIXTURE: ${textVi}`;
        if (rendered.length > 1200) {
            gaps.push('EXPLANATION_TRUNCATED');
            reasons.push('EXPLANATION_TRUNCATED');
        }
        claims.push({ kind: proof ? kind : 'INSUFFICIENT_EVIDENCE',
            textVi: rendered.slice(0, 1200), evidenceRefs: proof ? unique(evidenceRefs) : [] });
    };
    const gap = (code: string) => { gaps.push(code); reasons.push(code); };
    const requireEvidence = (phase: typeof phases[number]): boolean => {
        if (refs(phase).length > 0) return true;
        gap('MISSING_' + phase + '_EVIDENCE');
        return false;
    };
    const checked = (condition: boolean, error: string): boolean => {
        if (condition) return true;
        gap(error); return false;
    };

    const eventIds = snap.evidence.map(e => e.eventId);
    if (unique(eventIds).length !== eventIds.length) gap('DUPLICATE_EVENT_ID');
    if (snap.evidence.some((e, i, a) => i > 0 && Date.parse(e.occurredAt) < Date.parse(a[i - 1].occurredAt))) {
        gap('OUT_OF_ORDER_EVENTS');
    }
    if (snap.evidence.some((e, i, a) => i > 0 &&
        phases.indexOf(e.phase) < phases.indexOf(a[i - 1].phase))) gap('INVALID_PHASE_ORDER');
    if (verified.length === 0) gap('NO_VERIFIED_TRACE');
    if (!snap.auditRef) gap('MISSING_AUDIT_RECORD');
    if (!snap.checkpointRef) gap('MISSING_CHECKPOINT');
    if (snap.provenance === 'TEST_FIXTURE') gap('TEST_FIXTURE_ONLY');

    const inv = snap.inventory;
    if (inv) {
        if (snap.expectedSourceVersion && snap.expectedSourceVersion !== inv.sourceVersion) gap('SOURCE_VERSION_CONFLICT');
        if (snap.expectedRowVersion !== undefined && snap.expectedRowVersion !== inv.rowVersion) gap('ROW_VERSION_CONFLICT');
        if (snap.expectedMovementCursor !== undefined && snap.expectedMovementCursor !== inv.movementCursor)
            gap('MOVEMENT_CURSOR_CONFLICT');
        if (Date.parse(inv.readAt) > Date.parse(scope.now) ||
            Date.parse(scope.now) - Date.parse(inv.readAt) > scope.maxAgeMs) gap('STALE_SOURCE');
        if (!stockConsistent(inv)) gap('CONTRADICTORY_STOCK');
        if (!verified.some(e => e.eventId === inv.evidenceRef && e.sourceId === inv.sourceId &&
            e.sourceVersion === inv.sourceVersion)) gap('INVENTORY_SOURCE_NOT_CORRELATED');
    }
    if (snap.anomaly && (snap.anomaly.runId !== request.runId || !snap.anomaly.sourceVerified ||
        snap.anomaly.evidenceLevel !== 'SOURCE_ATTESTED')) gap('ANOMALY_SOURCE_UNVERIFIED');
    if (snap.replan && (snap.replan.runId !== request.runId ||
        snap.replan.actorId !== request.actorId || snap.replan.graphId !== request.graphId ||
        !snap.replan.sourceAttested)) gap('REPLAN_SOURCE_UNVERIFIED');
    if (snap.purchasing && (snap.purchasing.runId !== request.runId ||
        snap.purchasing.actorId !== request.actorId || !snap.purchasing.sourceAttested))
        gap('PURCHASING_SOURCE_UNVERIFIED');
    if (snap.observation && snap.act && snap.observation.invocationId !== snap.act.stepId)
        gap('ACT_OBS_CORRELATION_MISMATCH');
    if (snap.selection && snap.act && snap.selection.status === 'SELECTED' &&
        snap.selection.selectedTool !== snap.act.toolName) gap('TOOL_ACT_CORRELATION_MISMATCH');
    if (snap.plan && snap.act && snap.act.status !== 'NOT_EXECUTED' &&
        !snap.plan.steps.some(step => step.stepId === snap.act!.stepId))
        gap('PLAN_ACT_STEP_MISMATCH');
    if (snap.anomaly && snap.observation &&
        snap.anomaly.observationId !== snap.observation.auditTraceId)
        gap('ANM_OBS_CORRELATION_MISMATCH');
    if (snap.replan && snap.plan && (snap.replan.priorPlanId !== snap.plan.planId ||
        snap.replan.priorPlanVersion !== snap.plan.version))
        gap('REP_PLAN_CORRELATION_MISMATCH');
    if (snap.purchasing && inv && snap.purchasing.ingredientId !== inv.ingredientId)
        gap('PUR_INGREDIENT_CORRELATION_MISMATCH');
    if (snap.act && (snap.act.status === 'NOT_EXECUTED') !== (snap.act.attempts === 0))
        gap('ACT_ATTEMPT_CONFLICT');

    switch (request.topic) {
        case 'EXP-01': {
            requireEvidence('PER');
            if (!checked(!!inv, 'MISSING_INVENTORY_SOURCE')) break;
            if (gaps.some(g => ['STALE_SOURCE', 'SOURCE_VERSION_CONFLICT', 'ROW_VERSION_CONFLICT',
                'MOVEMENT_CURSOR_CONFLICT', 'CONTRADICTORY_STOCK', 'INVENTORY_SOURCE_NOT_CORRELATED'].includes(g))) break;
            claim('VERIFIED_FACT', `Nguyên liệu ${inv!.ingredientId}: tồn vật lý ${inv!.physical} ${inv!.unit}, đủ điều kiện ${inv!.eligible} ${inv!.unit}, đã giữ chỗ ${inv!.reserved} ${inv!.unit}, khả dụng ${inv!.available} ${inv!.unit}.`, [inv!.evidenceRef]);
            if (inv!.excludedExpired || inv!.excludedQuality) claim('VERIFIED_FACT',
                `Loại trừ hết hạn ${inv!.excludedExpired ?? '0'} ${inv!.unit}, chất lượng không đạt ${inv!.excludedQuality ?? '0'} ${inv!.unit} khỏi phần đủ điều kiện.`,
                [inv!.evidenceRef]);
            message = amount(inv!.available) === 0n ? 'Nguồn tồn kho đã kiểm tra không còn lượng khả dụng.' :
                'Lượng khả dụng được tính từ lượng đủ điều kiện trừ phần đã giữ chỗ.';
            break;
        }
        case 'EXP-02': {
            requireEvidence('TOOL');
            const selection = snap.selection;
            if (!checked(!!selection, 'MISSING_TOOL_DECISION')) break;
            if (selection!.status === 'SELECTED' && !selection!.selectedTool) {
                gap('SELECTED_TOOL_MISSING');
                break;
            }
            if (selection!.status === 'SELECTED' && selection!.selectedTool) {
                if (selection!.validationStatus !== 'VALID') {
                    gap('TOOL_VALIDATION_UNVERIFIED');
                    break;
                }
                const catalog = Object.prototype.hasOwnProperty.call(TOOL_CONTRACTS, selection!.selectedTool)
                    ? TOOL_CONTRACTS[selection!.selectedTool as keyof typeof TOOL_CONTRACTS] : undefined;
                if (!checked(!!catalog, 'UNKNOWN_REGISTERED_TOOL')) break;
                if (catalog!.category === 'WRITE' || catalog!.status !== 'IMPLEMENTED') {
                    gap('FORBIDDEN_TOOL_SELECTED');
                    break;
                }
                claim('POLICY_DECISION',
                    `Đã chọn công cụ ${catalog!.name} (v${catalog!.version}) để ${toolPurpose[catalog!.name]}; yêu cầu quyền ${catalog!.permission}; trạng thái chỉ là lựa chọn, chưa chứng minh thực thi.`,
                    refs('TOOL'));
                message = 'Công cụ được chọn theo quyết định TOOL đã ghi nhận; không đồng nghĩa đã thực thi.';
            } else {
                claim('POLICY_DECISION', 'Công cụ không được chọn hoặc đã bị chặn theo quyết định TOOL.',
                    refs('TOOL'));
                reasons.push(selection!.selectionReason);
                message = 'Quyết định TOOL không cho phép suy luận có một lần thực thi công cụ.';
            }
            break;
        }
        case 'EXP-03': {
            requireEvidence('PLN');
            const plan = snap.plan;
            if (!checked(!!plan, 'MISSING_VALIDATED_PLAN')) break;
            const pending = plan!.steps.filter(s => s.status === 'PENDING').length;
            claim('VERIFIED_FACT',
                `Kế hoạch ${plan!.planId} phiên bản ${plan!.version} gồm ${plan!.steps.length} bước đọc/xem xét và ${pending} bước đang chờ; quan hệ phụ thuộc được lưu trong kế hoạch.`,
                refs('PLN'));
            claim('VERIFIED_FACT', `Bước và phụ thuộc: ${plan!.steps.map(s =>
                `${s.stepId} (${s.kind}, ${s.status}; sau: ${s.dependsOn.join(', ') || 'không'})`
            ).join('; ')}.`, refs('PLN'));
            if (plan!.steps.some(s => s.status === 'COMPLETED' &&
                (snap.act?.status !== 'SUCCEEDED' || snap.act.stepId !== s.stepId ||
                    snap.observation?.observationStatus !== 'SUCCESS' ||
                    !snap.observation.verifiedForBusiness)))
                gap('PLAN_STEP_LACKS_ACT_PROOF');
            if (!inv) gap('PLAN_SOURCE_ASSUMPTIONS_UNVERIFIED');
            else claim('VERIFIED_FACT',
                `Giả định nguồn: phiên bản ${inv.sourceVersion}, cursor ${inv.movementCursor}; các bước còn phải tuân thủ chính sách hiện hành.`,
                [inv.evidenceRef]);
            message = 'Kế hoạch được mô tả từ bản ghi đã xác minh; bước hoàn tất phải có bằng chứng ACT tương ứng.';
            break;
        }
        case 'EXP-04': {
            requireEvidence('ACT'); requireEvidence('OBS');
            if (!checked(!!snap.act, 'MISSING_ACT_RESULT')) break;
            if (snap.act!.status === 'NOT_EXECUTED') {
                reasons.push('NOT_EXECUTED');
                message = 'Bước công cụ chưa được thực thi.';
                claim('VERIFIED_FACT', message, refs('ACT'));
            } else {
                if (!checked(!!snap.observation, 'MISSING_OBS_RESULT')) break;
                const a = snap.act!, o = snap.observation!;
                claim('VERIFIED_FACT',
                    `ACT: ${a.status}, ${a.attempts} lần thử; ${a.retryScheduled ? 'đã lên lịch thử lại' : 'không có chứng cứ lịch thử lại'}; ${a.timeoutObserved ? 'có timeout' : 'không có chứng cứ timeout'}. OBS: ${o.observationStatus}, chất lượng ${o.dataQuality}.`,
                    [...refs('ACT'), ...refs('OBS')]);
                if (a.retryScheduled) reasons.push('RETRY_SCHEDULED');
                if (a.timeoutObserved) reasons.push('TIMEOUT_OBSERVED');
                if (o.observationStatus !== 'SUCCESS' || !o.verifiedForBusiness ||
                    o.dataQuality !== 'VERIFIED_SCHEMA') gap('BUSINESS_EXECUTION_NOT_VERIFIED');
                message = a.status === 'SUCCEEDED' && o.observationStatus === 'SUCCESS' &&
                    o.verifiedForBusiness ? 'Có bằng chứng thực thi và quan sát phù hợp.' :
                    'ACT/OBS chưa chứng minh một bước nghiệp vụ thành công.';
            }
            break;
        }
        case 'EXP-05': {
            requireEvidence('ANM');
            if (!checked(!!snap.anomaly, 'MISSING_ANOMALY_RESULT')) break;
            if (!requireEvidence('OBS')) break;
            if (!snap.observation) gap('MISSING_OBS_RESULT');
            if (gaps.some(g => ['ANM_OBS_CORRELATION_MISMATCH',
                'ANOMALY_SOURCE_UNVERIFIED', 'MISSING_OBS_RESULT'].includes(g))) break;
            if (snap.anomaly!.findings.length) {
                for (const finding of snap.anomaly!.findings.slice(0, 15)) {
                    const quantities = ['expiredBase', 'available', 'physical', 'variance', 'observedTotal']
                        .filter(key => typeof finding.observedEvidence[key] === 'string' &&
                            /^(0|[1-9]\d{0,17})(\.\d{1,4})?$/.test(finding.observedEvidence[key]))
                        .map(key => `${key}=${finding.observedEvidence[key]}`).join(', ');
                    claim('VERIFIED_FACT',
                        `Cảnh báo ${finding.code}, mức ${finding.severity}, đối tượng ${finding.entityId}, nguồn v${finding.sourceVersion}, mức tin cậy ${finding.sourceConfidence}; ${quantities ? 'số đo ' + quantities + '; ' : ''}chính sách ${finding.policyRef ?? 'chưa xác minh'}; hướng xử lý ${finding.recommendedRoute}.`,
                        refs('ANM'));
                }
                message = 'Có phát hiện bất thường; hướng xử lý phụ thuộc mức độ và chính sách hiện hành.';
            } else message = 'Bản ghi ANM hiện không chứa phát hiện bất thường.';
            break;
        }
        case 'EXP-06': {
            requireEvidence('REP');
            if (!checked(!!snap.replan, 'MISSING_REPLAN_DECISION')) break;
            if (!requireEvidence('PLN')) break;
            if (!snap.plan) gap('MISSING_VALIDATED_PLAN');
            if (gaps.some(g => ['REP_PLAN_CORRELATION_MISMATCH',
                'REPLAN_SOURCE_UNVERIFIED', 'MISSING_VALIDATED_PLAN'].includes(g))) break;
            const rep = snap.replan!;
            claim('POLICY_DECISION',
                `Quyết định ${rep.status} cho kế hoạch ${rep.priorPlanId} phiên bản ${rep.priorPlanVersion}; ngân sách lập lại ${rep.usedReplans}/${rep.maxReplans}; bước ảnh hưởng: ${rep.changedStepRefs.join(', ') || 'không có'}. Quyết định vẫn phải qua kiểm tra chính sách.`,
                refs('REP'));
            message = replanText[rep.status]; reasons.push(...rep.reasons);
            if (rep.status === 'REVIEW_REQUIRED' || rep.status === 'REPLAN_PROPOSED')
                action = 'REQUEST_HUMAN_REVIEW';
            break;
        }
        case 'EXP-07': {
            requireEvidence('PUR');
            if (!checked(!!snap.purchasing, 'MISSING_PURCHASING_DECISION')) break;
            if (!requireEvidence('PER')) break;
            if (!inv) {
                gap('MISSING_INVENTORY_SOURCE');
                break;
            }
            const pur = snap.purchasing!;
            message = purchasingText[pur.status]; reasons.push(...pur.reasons);
            if (pur.draftPreview) {
                claim('RECOMMENDATION',
                    'Đang có bản xem trước yêu cầu nhập hàng. Bản xem trước không phải PurchaseRequest đã lưu hoặc được duyệt.',
                    refs('PUR'));
            }
            if (pur.status === 'RECOMMEND_PURCHASE' && pur.recommendedBase !== null &&
                pur.baseUnit !== null && pur.shortageBase !== null) {
                claim('RECOMMENDATION',
                    `Thiếu ${pur.shortageBase} ${pur.baseUnit}; gợi ý nhập ${pur.recommendedBase} ${pur.baseUnit}. Tồn đủ điều kiện ${pur.eligibleBase ?? 'chưa xác minh'}, khả dụng ${pur.availableBase ?? 'chưa xác minh'}, hàng đang về ${pur.incomingOutstandingBase ?? 'chưa xác minh'} ${pur.baseUnit}, ${pur.purchasePacks ?? 0} gói theo tính toán. Đây không phải PurchaseRequest đã được duyệt.`,
                    refs('PUR'));
                action = 'REQUEST_ADMIN_APPROVAL';
                // Supplier identity and calculated packs are not supplier acceptance, a
                // verified MOQ quote or an approved purchasing transaction.
                gap('SUPPLIER_CONFIRMATION_UNVERIFIED');
                gap('MOQ_POLICY_NOT_EXPOSED');
            } else claim('POLICY_DECISION', message, refs('PUR'));
            // PUR_INGREDIENT_V1 has DECISION_ONLY persistence. No actual Backend
            // PurchaseRequest/PO/receipt status is exposed by this contract.
            gap('PURCHASE_REQUEST_PERSISTENCE_UNVERIFIED');
            gap('PURCHASE_RECEIPT_UNVERIFIED');
            if (pur.rowVersion !== inv.rowVersion ||
                pur.movementCursor !== inv.movementCursor ||
                pur.availableBase !== inv.available || pur.eligibleBase !== inv.eligible ||
                pur.physicalBase !== inv.physical || pur.reservedBase !== inv.reserved)
                gap('PURCHASING_INVENTORY_VERSION_CONFLICT');
            if (!pur.evidenceRefs.includes(inv.evidenceRef))
                gap('PUR_SOURCE_REFERENCE_MISSING');
            break;
        }
        case 'EXP-08': {
            requireEvidence('SEC');
            if (!checked(!!snap.security, 'MISSING_AUTHORIZATION_DECISION')) break;
            const sec = snap.security!;
            if (!sec.policyRef) gap('MISSING_POLICY_REFERENCE');
            if ((sec.status === 'ALLOW') !== (sec.reason === 'AUTHORIZED')) gap('SEC_DECISION_CONFLICT');
            message = safePolicy[sec.reason]; reasons.push(sec.reason);
            claim('POLICY_DECISION', message, refs('SEC'));
            if (sec.status === 'PENDING_APPROVAL') action = 'REQUEST_ADMIN_APPROVAL';
            if (sec.status === 'HOLD' || sec.status === 'DENY') status = 'HOLD';
            break;
        }
        case 'EXP-09': {
            // Intentionally explain absence/conflict rather than filling missing business facts.
            if (!inv) gap('MISSING_INVENTORY_SOURCE');
            if (!snap.policyRef && !snap.security?.policyRef) gap('MISSING_POLICY_REFERENCE');
            if (!snap.observation) gap('MISSING_OBS_RESULT');
            if (!snap.anomaly) gap('MISSING_ANOMALY_RESULT');
            if (snap.purchasing && snap.purchasing.status === 'INSUFFICIENT_EVIDENCE')
                gap('UNVERIFIED_PURCHASING');
            message = gaps.length
                ? 'Bằng chứng chưa đầy đủ hoặc không nhất quán; cần xác minh lại trước khi quyết định.'
                : 'Các nguồn đã cung cấp không xuất hiện mâu thuẫn trong phạm vi kiểm tra này.';
            if (gaps.length) claim('INSUFFICIENT_EVIDENCE', message, []);
            break;
        }
        case 'EXP-10': {
            const expected = phases.filter(p => {
                const present = p === 'PER' ? !!inv : p === 'PLN' ? !!snap.plan :
                    p === 'TOOL' ? !!snap.selection : p === 'ACT' ? !!snap.act :
                    p === 'OBS' ? !!snap.observation : p === 'ANM' ? !!snap.anomaly :
                    p === 'REP' ? !!snap.replan : p === 'PUR' ? !!snap.purchasing : !!snap.security;
                return present;
            });
            for (const phase of expected) requireEvidence(phase);
            if (snap.evidence.some(e => e.status !== 'VERIFIED')) gap('INCOMPLETE_EVENT_CHAIN');
            for (const e of snap.evidence.filter(e => e.status === 'NOT_EXECUTED')) {
                claim('INSUFFICIENT_EVIDENCE',
                    `Giai đoạn ${e.phase} có bằng chứng NOT_EXECUTED, không được diễn giải thành đã chạy.`, []);
            }
            if (snap.selection?.status === 'SELECTED' && !snap.act)
                gap('ACT_NOT_EXECUTED_OR_MISSING');
            if (verified.some(e => !e.auditRef || !e.checkpointRef)) gap('EVENT_PROVENANCE_MISSING');
            if (verified.length) claim('VERIFIED_FACT',
                `Chuỗi bằng chứng ghi nhận ${verified.map(e => e.phase).join(' → ')}; mỗi sự kiện có tham chiếu riêng, không suy diễn bước thiếu.`,
                refs());
            message = 'Chuỗi truy vết chỉ chứa sự kiện có danh tính và tham chiếu nguồn được kiểm tra.';
            break;
        }
    }

    if (!message) message = 'Chưa đủ bằng chứng hợp lệ để giải thích quyết định nghiệp vụ.';
    if (gaps.includes('STALE_SOURCE') || gaps.includes('SOURCE_VERSION_CONFLICT') ||
        gaps.includes('ROW_VERSION_CONFLICT') || gaps.includes('MOVEMENT_CURSOR_CONFLICT')) {
        status = 'REFRESH_REQUIRED'; action = 'REQUEST_AUTHORIZED_READ';
        message = 'Dữ liệu tồn kho đã thay đổi hoặc hết hiệu lực. Cần đọc lại dữ liệu.';
    } else if (gaps.includes('CONTRADICTORY_STOCK') || gaps.includes('INVALID_PHASE_ORDER') ||
        gaps.includes('OUT_OF_ORDER_EVENTS') || gaps.includes('PURCHASING_INVENTORY_VERSION_CONFLICT') ||
        gaps.includes('FORBIDDEN_TOOL_SELECTED') || gaps.includes('SEC_DECISION_CONFLICT') ||
        gaps.includes('TOOL_ACT_CORRELATION_MISMATCH') || gaps.includes('ACT_OBS_CORRELATION_MISMATCH') ||
        gaps.includes('ANM_OBS_CORRELATION_MISMATCH') || gaps.includes('REP_PLAN_CORRELATION_MISMATCH') ||
        gaps.includes('PUR_INGREDIENT_CORRELATION_MISMATCH') || gaps.includes('PUR_SOURCE_REFERENCE_MISSING')) {
        status = 'HOLD'; action = 'REQUEST_HUMAN_REVIEW';
        message = 'Quy trình đã tạm dừng vì bằng chứng mâu thuẫn hoặc sai thứ tự.';
    } else if (gaps.length && status !== 'HOLD') {
        status = 'INSUFFICIENT_EVIDENCE';
        if (action === 'NONE') action = 'REQUEST_AUTHORIZED_READ';
        if (request.topic !== 'EXP-09') message =
            'Bằng chứng chưa đáp ứng điều kiện xác minh; chưa thể đưa ra kết luận chắc chắn.';
    }
    const result = base(request, status, message, reasons, gaps, scope, snap);
    const unresolvedSource = status === 'REFRESH_REQUIRED' ||
        (status === 'HOLD' && gaps.some(g => [
            'CONTRADICTORY_STOCK', 'INVALID_PHASE_ORDER', 'OUT_OF_ORDER_EVENTS',
            'PURCHASING_INVENTORY_VERSION_CONFLICT', 'TOOL_ACT_CORRELATION_MISMATCH',
            'ACT_OBS_CORRELATION_MISMATCH', 'ANM_OBS_CORRELATION_MISMATCH',
            'REP_PLAN_CORRELATION_MISMATCH', 'PUR_INGREDIENT_CORRELATION_MISMATCH',
            'PUR_SOURCE_REFERENCE_MISSING', 'SEC_DECISION_CONFLICT'
        ].includes(g)));
    // Conflicting/stale facts may be useful to the internal auditor but must
    // not be displayed as if they were still valid business quantities.
    result.claims = unresolvedSource ? [{
        kind: 'INSUFFICIENT_EVIDENCE',
        textVi: 'Bằng chứng chưa thống nhất hoặc đã thay đổi; không dùng số liệu này để quyết định.',
        evidenceRefs: []
    }] : claims;
    result.requiredHumanAction = action;
    if (!proof) result.limitations = unique([...result.limitations, 'NOT_LIVE_BUSINESS_PROOF']);
    return explanationResultSchema.parse(result);
}

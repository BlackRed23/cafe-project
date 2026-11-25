import { apiClient, unwrapApiData } from './client';

type ProposalReference = { version: number; contentHash: string };
type PurchaseRequestLink = { id: string; requestNumber: string; status: string };
type DecisionAudit = {
  version: number;
  createdAt: string;
  approvedAt: string | null;
  approvedById: string | null;
  rejectedAt: string | null;
  rejectedById: string | null;
  rejectionReason: string | null;
};

export type PurchasingGraph = {
  graphId: string;
  status: 'RUNNING' | 'AWAITING_APPROVAL' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'UNKNOWN' | 'DEGRADED_LLM' | 'HELD_POLICY';
  updatedAt: string;
  node: string | null;
  lastEvent: string | null;
  warning: string | null;
  proposalId: string | null;
  purchaseRequestId: string | null;
  purchaseRequestVerified: boolean;
};

export type GraphPurchaseProposal = ProposalReference & DecisionAudit & {
  graphId: string;
  proposalId: string;
  status: 'PENDING_APPROVAL' | 'APPROVED_AWAITING_BACKEND' | 'REJECTED' | 'EXECUTED';
  ingredientId?: string;
  ingredientName?: string;
  quantity: number;
  unit: string;
  baseUnit: string;
  unitsPerPack: string;
  unitPrice: string;
  supplierId: string;
  purchaseRequest: PurchaseRequestLink | null;
};

type ProposalPage = {
  proposals: (GraphPurchaseProposal & {
    confirmedStock: { availableBase: string; targetBase: string; shortageBase: string } | null;
  })[];
  graphs: PurchasingGraph[];
  page: number;
  hasNextPage: boolean;
};

export type GraphPurchaseReview = GraphPurchaseProposal & {
  graph: PurchasingGraph | null;
  reviewable: boolean;
  continuationPending: boolean;
  supplierName?: string;
  supplierAvailability: 'UNKNOWN';
  source: { rowVersion: string; movementCursor: string; policy: string } | null;
  demand: { asOf: string; observedMovements: number; dailyRate: number; sourceChanged: boolean | null } | null;
  evidence: {
    calculatedAt: string;
    calculation: { stockBase: string; targetBase: string; shortageBase: string; purchaseBase: string | null };
    warnings: string[];
  } | null;
  history: DecisionAudit[];
};

const endpoint = '/agent/graph-purchasing';
const graphPath = (graphId: string) => endpoint + '/' + encodeURIComponent(graphId);

export const graphPurchasingApi = {
  async list(page: number) {
    const response = await apiClient.get(endpoint, { params: { page } });
    return unwrapApiData<ProposalPage>(response.data);
  },
  async review(graphId: string) {
    const response = await apiClient.get(graphPath(graphId));
    return unwrapApiData<GraphPurchaseReview>(response.data);
  },
  async decide(graphId: string, reference: ProposalReference, decision: 'approve' | 'reject', reason: string) {
    const { version, contentHash } = reference;
    await apiClient.post(graphPath(graphId) + '/' + decision, {
      version, contentHash, ...(decision === 'reject' ? { reason } : {}),
    });
  },
};

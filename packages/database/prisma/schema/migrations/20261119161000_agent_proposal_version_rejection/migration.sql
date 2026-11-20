-- AI18: Additive, exact-revision ADMIN rejection evidence.
-- No data rewrite or policy activation. Existing approvals/receipts remain.
ALTER TABLE "AgentPurchaseProposalVersion"
  ADD COLUMN IF NOT EXISTS "rejectedById" TEXT,
  ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

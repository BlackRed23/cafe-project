-- Additive only. Apply solely through an explicitly selected deployment/test process.
CREATE TABLE "AgentPurchaseProposal" (
  "id" TEXT PRIMARY KEY,
  "currentVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("currentVersion" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "AgentPurchaseProposalVersion" (
  "proposalId" TEXT NOT NULL REFERENCES "AgentPurchaseProposal"("id") ON DELETE RESTRICT,
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "snapshot" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("proposalId", "version"),
  CHECK (("approvedById" IS NULL) = ("approvedAt" IS NULL))
);
ALTER TABLE "PurchaseRequest" ADD COLUMN "agentProposalId" TEXT,
  ADD COLUMN "agentProposalVersion" INTEGER;
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_agentProposal_pair_check"
  CHECK (("agentProposalId" IS NULL) = ("agentProposalVersion" IS NULL));
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_agentProposal_fkey"
  FOREIGN KEY ("agentProposalId", "agentProposalVersion")
  REFERENCES "AgentPurchaseProposalVersion"("proposalId", "version") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "PurchaseRequest_agentProposalId_agentProposalVersion_key"
  ON "PurchaseRequest"("agentProposalId", "agentProposalVersion");
CREATE TABLE "AgentPurchaseCommandReceipt" (
  "key" TEXT PRIMARY KEY,
  "requestHash" TEXT NOT NULL,
  "purchaseRequestId" TEXT NOT NULL REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

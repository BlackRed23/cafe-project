-- ADDITIVE PATCH for cafedb based on LO_DB_AUDIT.zip (2026-11-18).
-- Only 3 missing Agent purchase tables, 2 columns, and associated constraints.
-- IMPORTANT: This SQL does NOT create/populate _prisma_migrations.
-- Apply only after backup. Running it manually requires reconciling Prisma migration history
-- before using prisma migrate deploy; specifically 20261117090000_agent_purchase_proposal.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public;

DO $$
BEGIN
  IF current_database() <> 'cafedb' THEN
    RAISE EXCEPTION 'Refusing change: expected database cafedb, got %', current_database();
  END IF;
  IF to_regclass('public."PurchaseRequest"') IS NULL THEN
    RAISE EXCEPTION 'Missing existing PurchaseRequest table';
  END IF;
  IF to_regclass('public."AgentPurchaseProposal"') IS NOT NULL
     OR to_regclass('public."AgentPurchaseProposalVersion"') IS NOT NULL
     OR to_regclass('public."AgentPurchaseCommandReceipt"') IS NOT NULL THEN
    RAISE EXCEPTION 'Agent proposal tables already exist: review current schema before retry';
  END IF;
  IF EXISTS (
     SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'PurchaseRequest'
     AND column_name IN ('agentProposalId','agentProposalVersion')
  ) THEN
    RAISE EXCEPTION 'Agent proposal columns already exist: review before retry';
  END IF;
END $$;

CREATE TABLE "AgentPurchaseProposal" (
    "id" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentPurchaseProposal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AgentPurchaseProposal_currentVersion_check" CHECK ("currentVersion" > 0)
);

CREATE TABLE "AgentPurchaseProposalVersion" (
    "proposalId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentPurchaseProposalVersion_pkey" PRIMARY KEY ("proposalId", "version"),
    CONSTRAINT "AgentPurchaseProposalVersion_version_check" CHECK ("version" > 0),
    CONSTRAINT "AgentPurchaseProposalVersion_approval_pair_check"
      CHECK (("approvedById" IS NULL) = ("approvedAt" IS NULL)),
    CONSTRAINT "AgentPurchaseProposalVersion_proposalId_fkey"
      FOREIGN KEY ("proposalId") REFERENCES "AgentPurchaseProposal"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AgentPurchaseCommandReceipt" (
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "purchaseRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentPurchaseCommandReceipt_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "AgentPurchaseCommandReceipt_purchaseRequestId_fkey"
      FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "PurchaseRequest"
    ADD COLUMN "agentProposalId" TEXT,
    ADD COLUMN "agentProposalVersion" INTEGER;

ALTER TABLE "PurchaseRequest"
    ADD CONSTRAINT "PurchaseRequest_agentProposal_pair_check"
      CHECK (("agentProposalId" IS NULL) = ("agentProposalVersion" IS NULL)),
    ADD CONSTRAINT "PurchaseRequest_agentProposal_fkey"
      FOREIGN KEY ("agentProposalId", "agentProposalVersion")
      REFERENCES "AgentPurchaseProposalVersion"("proposalId", "version")
      ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PurchaseRequest_agentProposalId_agentProposalVersion_key"
    ON "PurchaseRequest"("agentProposalId", "agentProposalVersion");

COMMIT;

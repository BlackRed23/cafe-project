-- Additive, payment-only refund ledger. Do not retroactively assert refunds.
CREATE TYPE "PaymentRefundStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'UNKNOWN', 'SUCCEEDED', 'FAILED');

CREATE TABLE "PaymentRefund" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" "PaymentRefundStatus" NOT NULL DEFAULT 'REQUESTED',
  "reason" TEXT NOT NULL,
  "approvalRef" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "providerRefundId" TEXT,
  "providerCode" TEXT,
  "failureMessage" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentRefund_positive_amount" CHECK ("amount" > 0 AND "amount" = trunc("amount")),
  CONSTRAINT "PaymentRefund_attempts_nonnegative" CHECK ("attemptCount" >= 0)
);

CREATE TABLE "PaymentRefundEvent" (
  "id" TEXT NOT NULL,
  "refundId" TEXT NOT NULL,
  "status" "PaymentRefundStatus" NOT NULL,
  "kind" TEXT NOT NULL,
  "actorId" TEXT,
  "providerRef" TEXT,
  "detail" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentRefundEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentRefund_paymentId_requestId_key" ON "PaymentRefund"("paymentId", "requestId");
CREATE INDEX "PaymentRefund_paymentId_status_idx" ON "PaymentRefund"("paymentId", "status");
CREATE INDEX "PaymentRefundEvent_refundId_createdAt_idx" ON "PaymentRefundEvent"("refundId", "createdAt");
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRefundEvent" ADD CONSTRAINT "PaymentRefundEvent_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "PaymentRefund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep audit evidence append-only, including for privileged application accounts.
CREATE FUNCTION payment_refund_event_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PaymentRefundEvent is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER payment_refund_event_no_mutation
  BEFORE UPDATE OR DELETE ON "PaymentRefundEvent"
  FOR EACH ROW EXECUTE FUNCTION payment_refund_event_immutable();

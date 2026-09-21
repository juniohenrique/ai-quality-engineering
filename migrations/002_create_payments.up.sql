-- Create the payments table with an idempotency key column.
--
-- The idempotency_key column enforces uniqueness at the database level so that
-- duplicate charges with the same key are rejected by a UNIQUE constraint
-- (PostgreSQL error code 23505).  The application service layer supplements this
-- with an optimistic check + catch-and-fetch strategy to handle concurrent
-- requests that race past the initial lookup.
--
-- See: src/services/payment.service.ts  (PaymentService.createPayment)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key VARCHAR(255) NOT NULL UNIQUE,
  user_id         VARCHAR(255) NOT NULL,
  amount          INTEGER      NOT NULL,
  currency        VARCHAR(3)   NOT NULL,
  status          VARCHAR(50)  NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

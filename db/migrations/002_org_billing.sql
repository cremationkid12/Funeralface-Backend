-- Org-level Stripe subscription state (one row per funeral home / org).
CREATE TABLE IF NOT EXISTS org_billing (
  org_id TEXT PRIMARY KEY,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'none',
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT org_billing_status_check
    CHECK (status IN ('none', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete'))
);

CREATE INDEX IF NOT EXISTS org_billing_stripe_customer_id_idx
  ON org_billing(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

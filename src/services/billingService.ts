import { Pool } from "pg";
import Stripe from "stripe";

export const BILLING_PLAN_AMOUNT_CENTS = 1199;
export const BILLING_TRIAL_DAYS = 7;
export const BILLING_PLAN_INTERVAL = "month" as const;

export type BillingStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete";

export type OrgBillingRecord = {
  org_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: BillingStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export type SubscriptionView = {
  org_id: string;
  status: BillingStatus;
  plan_amount_cents: number;
  plan_interval: typeof BILLING_PLAN_INTERVAL;
  trial_days: number;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  is_subscribed: boolean;
};

export class SubscriptionRequiredError extends Error {
  override readonly name = "SubscriptionRequiredError";

  readonly code = "subscription_required";

  constructor(
    message = "An active subscription is required to share family links. Subscribe in Settings → Payment.",
  ) {
    super(message);
  }
}

export function assertOrgCanShareFamilyLinks(view: SubscriptionView): void {
  if (!view.is_subscribed) {
    throw new SubscriptionRequiredError();
  }
}

export type BillingService = {
  getSubscriptionView: (orgId: string) => Promise<SubscriptionView>;
  assertOrgCanShareFamilyLinks: (orgId: string) => Promise<void>;
  createCheckoutSession: (input: {
    orgId: string;
    customerEmail?: string;
    successUrl: string;
    cancelUrl: string;
  }) => Promise<{ checkout_url: string; session_id: string }>;
  createPortalSession: (input: {
    orgId: string;
    returnUrl: string;
  }) => Promise<{ portal_url: string }>;
  handleWebhookEvent: (rawBody: Buffer, signature: string) => Promise<void>;
};

let pgPool: Pool | null = null;

function getPgPool(): Pool {
  if (pgPool) return pgPool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for billing service.");
  }
  pgPool = new Pool({ connectionString });
  return pgPool;
}

function getStripe(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    throw new Error("STRIPE_SECRET_KEY is required for billing.");
  }
  return new Stripe(secret);
}

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status): BillingStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
      return "unpaid";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    default:
      return "none";
  }
}

function rowToRecord(row: {
  org_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string;
  trial_ends_at: Date | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
}): OrgBillingRecord {
  return {
    org_id: row.org_id,
    stripe_customer_id: row.stripe_customer_id,
    stripe_subscription_id: row.stripe_subscription_id,
    status: row.status as BillingStatus,
    trial_ends_at: toIso(row.trial_ends_at),
    current_period_end: toIso(row.current_period_end),
    cancel_at_period_end: row.cancel_at_period_end,
  };
}

function toSubscriptionView(record: OrgBillingRecord): SubscriptionView {
  const subscribed = record.status === "trialing" || record.status === "active";
  return {
    org_id: record.org_id,
    status: record.status,
    plan_amount_cents: BILLING_PLAN_AMOUNT_CENTS,
    plan_interval: BILLING_PLAN_INTERVAL,
    trial_days: BILLING_TRIAL_DAYS,
    trial_ends_at: record.trial_ends_at,
    current_period_end: record.current_period_end,
    cancel_at_period_end: record.cancel_at_period_end,
    is_subscribed: subscribed,
  };
}

async function getOrCreateBillingRow(orgId: string): Promise<OrgBillingRecord> {
  const pool = getPgPool();
  const existing = await pool.query(
    `
    SELECT org_id, stripe_customer_id, stripe_subscription_id, status,
           trial_ends_at, current_period_end, cancel_at_period_end
    FROM org_billing
    WHERE org_id = $1
    LIMIT 1
    `,
    [orgId],
  );
  if (existing.rows[0]) {
    return rowToRecord(existing.rows[0]);
  }

  const inserted = await pool.query(
    `
    INSERT INTO org_billing (org_id, status)
    VALUES ($1, 'none')
    ON CONFLICT (org_id) DO NOTHING
    RETURNING org_id, stripe_customer_id, stripe_subscription_id, status,
              trial_ends_at, current_period_end, cancel_at_period_end
    `,
    [orgId],
  );
  if (inserted.rows[0]) {
    return rowToRecord(inserted.rows[0]);
  }

  const again = await pool.query(
    `
    SELECT org_id, stripe_customer_id, stripe_subscription_id, status,
           trial_ends_at, current_period_end, cancel_at_period_end
    FROM org_billing
    WHERE org_id = $1
    LIMIT 1
    `,
    [orgId],
  );
  return rowToRecord(again.rows[0]);
}

async function upsertFromStripeSubscription(
  orgId: string,
  subscription: Stripe.Subscription,
  customerId: string | null,
): Promise<OrgBillingRecord> {
  const pool = getPgPool();
  const status = mapStripeSubscriptionStatus(subscription.status);
  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : null;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;

  const result = await pool.query(
    `
    INSERT INTO org_billing (
      org_id,
      stripe_customer_id,
      stripe_subscription_id,
      status,
      trial_ends_at,
      current_period_end,
      cancel_at_period_end
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (org_id)
    DO UPDATE SET
      stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, org_billing.stripe_customer_id),
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      status = EXCLUDED.status,
      trial_ends_at = EXCLUDED.trial_ends_at,
      current_period_end = EXCLUDED.current_period_end,
      cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      updated_at = NOW()
    RETURNING org_id, stripe_customer_id, stripe_subscription_id, status,
              trial_ends_at, current_period_end, cancel_at_period_end
    `,
    [
      orgId,
      customerId,
      subscription.id,
      status,
      trialEnd,
      periodEnd,
      subscription.cancel_at_period_end,
    ],
  );
  return rowToRecord(result.rows[0]);
}

async function resolveOrgIdFromSubscription(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const metaOrg = subscription.metadata?.org_id?.trim();
  if (metaOrg) return metaOrg;

  const pool = getPgPool();
  const bySub = await pool.query(
    `SELECT org_id FROM org_billing WHERE stripe_subscription_id = $1 LIMIT 1`,
    [subscription.id],
  );
  if (bySub.rows[0]?.org_id) {
    return bySub.rows[0].org_id as string;
  }

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;
  if (!customerId) return null;

  const byCustomer = await pool.query(
    `SELECT org_id FROM org_billing WHERE stripe_customer_id = $1 LIMIT 1`,
    [customerId],
  );
  return (byCustomer.rows[0]?.org_id as string | undefined) ?? null;
}

/** Pull latest trialing/active subscription from Stripe when webhooks did not update the DB. */
async function syncSubscriptionFromStripeIfNeeded(
  orgId: string,
  record: OrgBillingRecord,
): Promise<OrgBillingRecord> {
  if (!record.stripe_customer_id) return record;
  if (record.status === "trialing" || record.status === "active") return record;

  try {
    const stripe = getStripe();
    const listed = await stripe.subscriptions.list({
      customer: record.stripe_customer_id,
      status: "all",
      limit: 10,
    });
    const match = listed.data.find(
      (sub) => sub.status === "trialing" || sub.status === "active",
    );
    if (!match) return record;

    return await upsertFromStripeSubscription(orgId, match, record.stripe_customer_id);
  } catch (error) {
    console.warn("[billing] Stripe subscription sync failed:", error);
    return record;
  }
}

export const defaultBillingService: BillingService = {
  async getSubscriptionView(orgId: string): Promise<SubscriptionView> {
    const initial = await getOrCreateBillingRow(orgId);
    const record = await syncSubscriptionFromStripeIfNeeded(orgId, initial);
    return toSubscriptionView(record);
  },

  async assertOrgCanShareFamilyLinks(orgId: string): Promise<void> {
    const view = await this.getSubscriptionView(orgId);
    assertOrgCanShareFamilyLinks(view);
  },

  async createCheckoutSession(input) {
    const stripe = getStripe();
    const priceId = process.env.STRIPE_PRICE_ID?.trim();
    if (!priceId) {
      throw new Error("STRIPE_PRICE_ID is required for checkout.");
    }

    const record = await getOrCreateBillingRow(input.orgId);
    if (record.status === "trialing" || record.status === "active") {
      const error = new Error("Organization already has an active subscription.");
      (error as Error & { code?: string }).code = "subscription_exists";
      throw error;
    }

    let customerId = record.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: input.customerEmail?.trim() || undefined,
        metadata: { org_id: input.orgId },
      });
      customerId = customer.id;
      const pool = getPgPool();
      await pool.query(
        `
        INSERT INTO org_billing (org_id, stripe_customer_id, status)
        VALUES ($1, $2, 'none')
        ON CONFLICT (org_id)
        DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id, updated_at = NOW()
        `,
        [input.orgId, customerId],
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: BILLING_TRIAL_DAYS,
        metadata: { org_id: input.orgId },
      },
      client_reference_id: input.orgId,
      metadata: { org_id: input.orgId },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      allow_promotion_codes: false,
    });

    if (!session.url) {
      throw new Error("Stripe checkout session did not return a URL.");
    }

    return { checkout_url: session.url, session_id: session.id };
  },

  async createPortalSession(input) {
    const stripe = getStripe();
    const record = await getOrCreateBillingRow(input.orgId);
    if (!record.stripe_customer_id) {
      const error = new Error("No billing customer exists for this organization.");
      (error as Error & { code?: string }).code = "billing_customer_missing";
      throw error;
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: record.stripe_customer_id,
      return_url: input.returnUrl,
    });

    return { portal_url: session.url };
  },

  async handleWebhookEvent(rawBody, signature) {
    const stripe = getStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is required for webhooks.");
    }

    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    console.log(`[billing] webhook received: ${event.type} (${event.id})`);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId =
          session.metadata?.org_id?.trim() ||
          session.client_reference_id?.trim() ||
          null;
        if (!orgId || !session.subscription) break;

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id ?? null;
        await upsertFromStripeSubscription(orgId, subscription, customerId);
        console.log(`[billing] synced checkout subscription for org ${orgId}`);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = await resolveOrgIdFromSubscription(subscription);
        if (!orgId) break;
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id ?? null;
        if (event.type === "customer.subscription.deleted") {
          const pool = getPgPool();
          await pool.query(
            `
            UPDATE org_billing
            SET status = 'canceled',
                stripe_subscription_id = NULL,
                cancel_at_period_end = false,
                updated_at = NOW()
            WHERE org_id = $1
            `,
            [orgId],
          );
        } else {
          await upsertFromStripeSubscription(orgId, subscription, customerId);
        }
        break;
      }
      default:
        break;
    }
  },
};

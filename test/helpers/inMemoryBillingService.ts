import {
  assertOrgCanShareFamilyLinks,
  assertOrgHasActiveSubscription,
  BILLING_PLAN_AMOUNT_CENTS,
  BILLING_TRIAL_DAYS,
  type BillingService,
  type SubscriptionView,
} from "../../src/services/billingService";

export function createInMemoryBillingService(
  initial?: Partial<Record<string, Partial<SubscriptionView>>>,
): BillingService & {
  setSubscribed(orgId: string, subscribed: boolean): void;
} {
  const store = new Map<string, SubscriptionView>();

  const defaultView = (orgId: string): SubscriptionView => {
    const override = initial?.[orgId];
    const base: SubscriptionView = {
      org_id: orgId,
      status: "none",
      plan_amount_cents: BILLING_PLAN_AMOUNT_CENTS,
      plan_interval: "month",
      trial_days: BILLING_TRIAL_DAYS,
      trial_ends_at: null,
      current_period_end: null,
      cancel_at_period_end: false,
      is_subscribed: false,
    };
    if (!override) return base;
    return { ...base, ...override, org_id: orgId };
  };

  const service = {
    async getSubscriptionView(orgId: string): Promise<SubscriptionView> {
      return store.get(orgId) ?? defaultView(orgId);
    },

    async assertOrgHasActiveSubscription(orgId: string): Promise<void> {
      const view = await this.getSubscriptionView(orgId);
      assertOrgHasActiveSubscription(view);
    },

    async assertOrgCanShareFamilyLinks(orgId: string): Promise<void> {
      await this.assertOrgHasActiveSubscription(orgId);
    },

    async createCheckoutSession(input: { orgId: string }) {
      const current = await this.getSubscriptionView(input.orgId);
      if (current.is_subscribed) {
        const error = new Error("already subscribed");
        (error as Error & { code?: string }).code = "subscription_exists";
        throw error;
      }
      return {
        checkout_url: "https://checkout.stripe.test/session",
        session_id: "cs_test_123",
      };
    },

    async createPortalSession(input: { orgId: string }) {
      const current = await this.getSubscriptionView(input.orgId);
      if (current.status === "none") {
        const error = new Error("missing customer");
        (error as Error & { code?: string }).code = "billing_customer_missing";
        throw error;
      }
      return { portal_url: "https://billing.stripe.test/portal" };
    },

    async handleWebhookEvent() {
      // no-op for API tests
    },

    setSubscribed(orgId: string, subscribed: boolean): void {
      const current = store.get(orgId) ?? defaultView(orgId);
      store.set(orgId, {
        ...current,
        status: subscribed ? "active" : "none",
        is_subscribed: subscribed,
      });
    },
  };

  for (const [orgId, view] of Object.entries(initial ?? {})) {
    if (view?.is_subscribed) {
      service.setSubscribed(orgId, true);
    }
  }

  return service;
}

/** Marks the given orgs as subscribed for write-route API tests. */
export function billingWithSubscribedOrgs(
  ...orgIds: string[]
): ReturnType<typeof createInMemoryBillingService> {
  const billing = createInMemoryBillingService();
  for (const orgId of orgIds) {
    billing.setSubscribed(orgId, true);
  }
  return billing;
}

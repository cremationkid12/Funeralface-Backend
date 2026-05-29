import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../../src/app";
import { BILLING_PLAN_AMOUNT_CENTS, BILLING_TRIAL_DAYS } from "../../src/services/billingService";
import { createInMemoryBillingService } from "../helpers/inMemoryBillingService";

const JWT_SECRET = "test-secret-billing";

function makeToken(orgId: string, role = "admin"): string {
  return jwt.sign({ sub: "user-1", role, org_id: orgId }, JWT_SECRET);
}

test.before(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.STRIPE_CHECKOUT_SUCCESS_URL = "everroute://billing/success";
  process.env.STRIPE_CHECKOUT_CANCEL_URL = "everroute://billing/cancel";
  process.env.STRIPE_PORTAL_RETURN_URL = "everroute://billing/portal";
});

test("GET /v1/billing/subscription returns plan details", async () => {
  const billingService = createInMemoryBillingService();
  const app = createApp({ billingService });
  const response = await request(app)
    .get("/v1/billing/subscription")
    .set("Authorization", `Bearer ${makeToken("org-bill-1")}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.plan_amount_cents, 1199);
  assert.equal(response.body.trial_days, 7);
  assert.equal(response.body.status, "none");
  assert.equal(response.body.is_subscribed, false);
});

test("POST /v1/billing/checkout-session requires admin", async () => {
  const billingService = createInMemoryBillingService();
  const app = createApp({ billingService });

  const forbidden = await request(app)
    .post("/v1/billing/checkout-session")
    .set("Authorization", `Bearer ${makeToken("org-bill-2", "user")}`);
  assert.equal(forbidden.status, 403);

  const ok = await request(app)
    .post("/v1/billing/checkout-session")
    .set("Authorization", `Bearer ${makeToken("org-bill-2", "admin")}`);
  assert.equal(ok.status, 200);
  assert.ok(ok.body.checkout_url);
});

test("POST /v1/billing/portal-session returns 404 without customer", async () => {
  const billingService = createInMemoryBillingService();
  const app = createApp({ billingService });
  const response = await request(app)
    .post("/v1/billing/portal-session")
    .set("Authorization", `Bearer ${makeToken("org-bill-3", "admin")}`);

  assert.equal(response.status, 404);
  assert.equal(response.body.code, "billing_customer_missing");
});

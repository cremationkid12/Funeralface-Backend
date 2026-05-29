import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../../src/app";
import { createInMemoryAssignmentService } from "../helpers/inMemoryAssignmentService";
import { createInMemorySettingsService } from "../helpers/inMemorySettingsService";
import { billingWithSubscribedOrgs, createInMemoryBillingService } from "../helpers/inMemoryBillingService";

const JWT_SECRET = "test-secret-write-access";

function makeToken(orgId: string, role: "admin" | "user" = "admin"): string {
  return jwt.sign({ sub: "user-1", role, org_id: orgId }, JWT_SECRET);
}

test.before(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.STRIPE_CHECKOUT_SUCCESS_URL = "everroute://billing/success";
  process.env.STRIPE_CHECKOUT_CANCEL_URL = "everroute://billing/cancel";
  process.env.STRIPE_PORTAL_RETURN_URL = "everroute://billing/portal";
});

test("non-admin cannot POST /v1/assignments when subscribed", async () => {
  const { service } = createInMemoryAssignmentService();
  const app = createApp({
    assignmentService: service,
    billingService: billingWithSubscribedOrgs("org-1"),
  });

  const response = await request(app)
    .post("/v1/assignments")
    .set("Authorization", `Bearer ${makeToken("org-1", "user")}`)
    .send({
      decedent_name: "Blocked",
      pickup_address: "A",
      contact_name: "C",
      contact_phone: "1",
    });

  assert.equal(response.status, 403);
  assert.equal(response.body.code, "forbidden");
});

test("admin cannot POST /v1/assignments without active subscription", async () => {
  const { service } = createInMemoryAssignmentService();
  const billing = createInMemoryBillingService();
  const app = createApp({ assignmentService: service, billingService: billing });

  const response = await request(app)
    .post("/v1/assignments")
    .set("Authorization", `Bearer ${makeToken("org-unsub")}`)
    .send({
      decedent_name: "Blocked",
      pickup_address: "A",
      contact_name: "C",
      contact_phone: "1",
    });

  assert.equal(response.status, 403);
  assert.equal(response.body.code, "subscription_required");
});

test("admin can POST /v1/billing/checkout-session without subscription", async () => {
  const billing = createInMemoryBillingService();
  const app = createApp({ billingService: billing });

  const response = await request(app)
    .post("/v1/billing/checkout-session")
    .set("Authorization", `Bearer ${makeToken("org-unsub")}`);

  assert.equal(response.status, 200);
  assert.ok(response.body.checkout_url);
});

test("user cannot PATCH /v1/staff/me without subscription", async () => {
  const billing = createInMemoryBillingService();
  const app = createApp({ billingService: billing });

  const response = await request(app)
    .patch("/v1/staff/me")
    .set("Authorization", `Bearer ${makeToken("org-1", "user")}`)
    .send({ name: "Updated Name" });

  assert.equal(response.status, 403);
  assert.equal(response.body.code, "subscription_required");
});

test("non-admin cannot PATCH /v1/settings when subscribed", async () => {
  const app = createApp({
    settingsService: createInMemorySettingsService(),
    billingService: billingWithSubscribedOrgs("org-1"),
  });

  const response = await request(app)
    .patch("/v1/settings")
    .set("Authorization", `Bearer ${makeToken("org-1", "user")}`)
    .send({ funeral_home_name: "Blocked" });

  assert.equal(response.status, 403);
  assert.equal(response.body.code, "forbidden");
});

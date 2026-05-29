import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../../src/app";
import { billingWithSubscribedOrgs } from "../helpers/inMemoryBillingService";
import { createInMemoryAssignmentService } from "../helpers/inMemoryAssignmentService";
import {
  type AssignmentCreateInput,
  type AssignmentService,
  type AssignmentUpdateInput,
} from "../../src/services/assignmentService";

const JWT_SECRET = "test-secret-assignments";

function makeToken(orgId: string, userId = "user-1", role = "admin"): string {
  return jwt.sign({ sub: userId, role, org_id: orgId }, JWT_SECRET);
}

function appWithAssignments(service: AssignmentService, ...orgIds: string[]) {
  return createApp({
    assignmentService: service,
    billingService: billingWithSubscribedOrgs(...orgIds),
  });
}

test.before(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

test("GET /v1/assignments returns 401 without token", async () => {
  const { service } = createInMemoryAssignmentService();
  const app = createApp({ assignmentService: service });
  const response = await request(app).get("/v1/assignments");
  assert.equal(response.status, 401);
});

test("POST /v1/assignments creates assignment", async () => {
  const { service } = createInMemoryAssignmentService();
  const app = appWithAssignments(service, "org-1");
  const response = await request(app)
    .post("/v1/assignments")
    .set("Authorization", `Bearer ${makeToken("org-1")}`)
    .send({
      decedent_name: "John Doe",
      pickup_address: "123 Main St",
      contact_name: "Jane Doe",
      contact_phone: "555-1111",
    } satisfies AssignmentCreateInput);

  assert.equal(response.status, 201);
  assert.equal(response.body.org_id, "org-1");
  assert.equal(response.body.status, "pending");
});

test("GET /v1/assignments is org-scoped", async () => {
  const { service } = createInMemoryAssignmentService();
  const app = appWithAssignments(service, "org-1", "org-2");

  await request(app)
    .post("/v1/assignments")
    .set("Authorization", `Bearer ${makeToken("org-1")}`)
    .send({
      decedent_name: "Org1",
      pickup_address: "A",
      contact_name: "C1",
      contact_phone: "1",
    } satisfies AssignmentCreateInput);
  await request(app)
    .post("/v1/assignments")
    .set("Authorization", `Bearer ${makeToken("org-2")}`)
    .send({
      decedent_name: "Org2",
      pickup_address: "B",
      contact_name: "C2",
      contact_phone: "2",
    } satisfies AssignmentCreateInput);

  const org1 = await request(app).get("/v1/assignments").set("Authorization", `Bearer ${makeToken("org-1")}`);
  const org2 = await request(app).get("/v1/assignments").set("Authorization", `Bearer ${makeToken("org-2")}`);

  assert.equal(org1.status, 200);
  assert.equal(org2.status, 200);
  assert.equal(org1.body.items.length, 1);
  assert.equal(org2.body.items.length, 1);
  assert.equal(org1.body.items[0].decedent_name, "Org1");
  assert.equal(org2.body.items[0].decedent_name, "Org2");
});

test("PATCH /v1/assignments/:id updates status and creates audit log", async () => {
  const { service, audits } = createInMemoryAssignmentService();
  const app = appWithAssignments(service, "org-1");

  const created = await request(app)
    .post("/v1/assignments")
    .set("Authorization", `Bearer ${makeToken("org-1", "actor-1")}`)
    .send({
      decedent_name: "Status Flow",
      pickup_address: "X",
      contact_name: "Y",
      contact_phone: "Z",
      status: "completed",
    } satisfies AssignmentCreateInput);

  const update = await request(app)
    .patch(`/v1/assignments/${created.body.id}`)
    .set("Authorization", `Bearer ${makeToken("org-1", "actor-1")}`)
    .send({ status: "pending" } satisfies AssignmentUpdateInput);

  assert.equal(update.status, 200);
  assert.equal(update.body.status, "pending");
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.fromStatus, "completed");
  assert.equal(audits[0]?.toStatus, "pending");
});

test("PATCH /v1/assignments/:id 404 for cross-org assignment", async () => {
  const { service } = createInMemoryAssignmentService();
  const app = appWithAssignments(service, "org-1", "org-2");

  const created = await request(app)
    .post("/v1/assignments")
    .set("Authorization", `Bearer ${makeToken("org-1")}`)
    .send({
      decedent_name: "Cross Org",
      pickup_address: "Addr",
      contact_name: "Contact",
      contact_phone: "Phone",
    } satisfies AssignmentCreateInput);

  const update = await request(app)
    .patch(`/v1/assignments/${created.body.id}`)
    .set("Authorization", `Bearer ${makeToken("org-2")}`)
    .send({ status: "assigned" } satisfies AssignmentUpdateInput);

  assert.equal(update.status, 404);
});

